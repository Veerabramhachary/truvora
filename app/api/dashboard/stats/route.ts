import { db } from "@/db";
import { transactions, subscriptions } from "@/db/schema/schema";
import { auth } from "@clerk/nextjs/server";
import { and, count, eq, gte, isNull, lt, sql, lte, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import { toPaise } from "@/lib/money";

const querySchema = z.object({
    currency: z.literal("INR").default("INR"),
});

export const GET = async (request: NextRequest) => {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json(
                { message: "Unauthorized" },
                { status: 401 },
            );
        }

        const { searchParams } = request.nextUrl;
        const query = querySchema.safeParse({
            currency: searchParams.get("currency") ?? undefined,
        });

        if (!query.success) {
            return NextResponse.json(
                {
                    error: "Invalid query parameters",
                    details: query.error.flatten(),
                },
                { status: 400 },
            );
        }

        const { currency } = query.data;

        // ---------- Date boundaries ----------
        const now = new Date();

        const startOfCurrentMonth = new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
        );
        startOfCurrentMonth.setHours(0, 0, 0, 0);

        const startOfPreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1,
        );
        startOfPreviousMonth.setHours(0, 0, 0, 0);

        const startOfNextMonth = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            1,
        );
        startOfNextMonth.setHours(0, 0, 0, 0);

        // ---------- Parallel data fetching ----------
        const [
            activeSubsCurrent,
            incomeCurrent,
            incomePrevious,
            expenseCurrent,
            expensePrevious,
            subsCurrent,
            subsPrevious,
            activeSubsPrevious,
        ] = await Promise.all([
            // 1. Current active subscriptions count
            db
                .select({ value: count() })
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.userId, userId),
                        eq(subscriptions.currency, currency),
                        eq(subscriptions.active, true),
                    ),
                )
                .then((res) => res[0]?.value ?? 0),

            // 2. Income current month (transactions)
            db
                .select({
                    value: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
                })
                .from(transactions)
                .where(
                    and(
                        eq(transactions.userId, userId),
                        eq(transactions.currency, currency),
                        eq(transactions.type, "income"),
                        eq(transactions.action, "created"),
                        gte(transactions.date, startOfCurrentMonth),
                        lt(transactions.date, startOfNextMonth), // FIXED
                    ),
                )
                .then((res) => String(res[0]?.value ?? "0")),

            // 3. Income previous month (transactions)
            db
                .select({
                    value: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
                })
                .from(transactions)
                .where(
                    and(
                        eq(transactions.userId, userId),
                        eq(transactions.currency, currency),
                        eq(transactions.type, "income"),
                        eq(transactions.action, "created"),
                        gte(transactions.date, startOfPreviousMonth),
                        lt(transactions.date, startOfCurrentMonth),
                    ),
                )
                .then((res) => String(res[0]?.value ?? "0")),

            // 4. Expense current month (transactions)
            db
                .select({
                    value: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
                })
                .from(transactions)
                .where(
                    and(
                        eq(transactions.userId, userId),
                        eq(transactions.currency, currency),
                        eq(transactions.type, "expense"),
                        eq(transactions.action, "created"),
                        gte(transactions.date, startOfCurrentMonth),
                        lt(transactions.date, startOfNextMonth), // FIXED
                    ),
                )
                .then((res) => String(res[0]?.value ?? "0")),

            // 5. Previous month expenses, used for an apples-to-apples spend change.
            db
                .select({ value: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text` })
                .from(transactions)
                .where(and(
                    eq(transactions.userId, userId),
                    eq(transactions.currency, currency),
                    eq(transactions.type, "expense"),
                    eq(transactions.action, "created"),
                    gte(transactions.date, startOfPreviousMonth),
                    lt(transactions.date, startOfCurrentMonth),
                ))
                .then((res) => String(res[0]?.value ?? "0")),

            // 6. Subscriptions total monthly spend (current active)
            db
                .select({
                    value: sql<string>`COALESCE(SUM(ROUND(${subscriptions.price} / (CASE WHEN ${subscriptions.interval} = 'year' THEN 12 ELSE 1 END * ${subscriptions.intervalCount}), 2)), 0)::text`,
                })
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.userId, userId),
                        eq(subscriptions.currency, currency),
                        eq(subscriptions.active, true),
                    ),
                )
                .then((res) => String(res[0]?.value ?? "0")),

            // 7. Previous month subscription run-rate. Annual charges are
            // normalized to monthly value and dates are checked for overlap.
            db
                .select({ value: sql<string>`COALESCE(SUM(ROUND(${subscriptions.price} / (CASE WHEN ${subscriptions.interval} = 'year' THEN 12 ELSE 1 END * ${subscriptions.intervalCount}), 2)), 0)::text` })
                .from(subscriptions)
                .where(and(
                    eq(subscriptions.userId, userId),
                    eq(subscriptions.currency, currency),
                    gte(subscriptions.endDate, startOfPreviousMonth),
                    lt(subscriptions.startDate, startOfCurrentMonth),
                    or(isNull(subscriptions.deactivatedAt), gte(subscriptions.deactivatedAt, startOfPreviousMonth)),
                ))
                .then((res) => String(res[0]?.value ?? "0")),

            // 6. Active subscriptions count at the end of previous month
            (async () => {
                const latestEvents = db
                    .select({
                        subscriptionId: transactions.subscriptionId,
                        action: transactions.action,
                        rowNum: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${transactions.subscriptionId} ORDER BY ${transactions.date} DESC)`.as(
                            "row_num",
                        ),
                    })
                    .from(transactions)
                    .where(
                        and(
                            eq(transactions.userId, userId),
                            eq(transactions.type, "subscription"),
                            lt(transactions.date, startOfCurrentMonth), // CUTOFF = start of current month
                        ),
                    )
                    .as("latest");

                const result = await db
                    .select({ value: count() })
                    .from(subscriptions)
                    .innerJoin(
                        latestEvents,
                        eq(subscriptions.id, latestEvents.subscriptionId),
                    )
                    .where(
                        and(
                            sql`${latestEvents.rowNum} = 1`,
                            sql`${latestEvents.action} != 'deleted'`,
                            lte(subscriptions.startDate, startOfCurrentMonth),
                            eq(subscriptions.currency, currency),
                        ),
                    );

                return result[0]?.value ?? 0;
            })(),
        ]);

        // ---------- Aggregations ----------
        // Keep monetary arithmetic in integer paise until serialization so
        // large totals and fractional rupees do not accumulate float error.
        const incomeCurrentPaise = toPaise(incomeCurrent);
        const incomePreviousPaise = toPaise(incomePrevious);
        const expenseCurrentPaise = toPaise(expenseCurrent);
        const subscriptionSpendPaise = toPaise(subsCurrent);
        const previousSpendPaise = toPaise(expensePrevious) + toPaise(subsPrevious);
        const totalSpendPaise = expenseCurrentPaise + subscriptionSpendPaise;
        const totalSpendCurrent = Number(totalSpendPaise) / 100;

        const incomeGrowth = incomePreviousPaise > BigInt(0)
            ? (Number(incomeCurrentPaise - incomePreviousPaise) / Number(incomePreviousPaise)) * 100
            : 0;

        const activeSubsGrowth = activeSubsPrevious
            ? ((activeSubsCurrent - activeSubsPrevious) / activeSubsPrevious) *
              100
            : 0;
        const totalSpendGrowth = previousSpendPaise > BigInt(0)
            ? Number(totalSpendPaise - previousSpendPaise) / Number(previousSpendPaise) * 100
            : 0;

        // ---------- Response ----------
        return NextResponse.json({
            totalSpend: totalSpendCurrent,
            activeSubscriptions: activeSubsCurrent,
            totalIncome: Number(incomeCurrentPaise) / 100,
            growth: {
                income: Number(incomeGrowth.toFixed(1)),
                activeSubscriptions: Number(activeSubsGrowth.toFixed(1)),
                totalSpend: Number(totalSpendGrowth.toFixed(1)),
            },
        });
    } catch {
        return NextResponse.json(
            { message: "Internal server error" },
            { status: 500 },
        );
    }
};
