import { db } from "@/db";
import { transactions, subscriptions } from "@/db/schema/schema";
import { auth } from "@clerk/nextjs/server";
import { and, count, eq, gte, lt, sql, lte, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const querySchema = z.object({
    currency: z.string().default("USD"),
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
            currency: searchParams.get("currency"),
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
            subsCurrent,
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
                    value: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
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
                .then((res) => Number(res[0]?.value ?? 0)),

            // 3. Income previous month (transactions)
            db
                .select({
                    value: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
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
                .then((res) => Number(res[0]?.value ?? 0)),

            // 4. Expense current month (transactions)
            db
                .select({
                    value: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
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
                .then((res) => Number(res[0]?.value ?? 0)),

            // 5. Subscriptions total monthly spend (current active)
            db
                .select({
                    value: sql<number>`COALESCE(SUM(${subscriptions.price}), 0)`,
                })
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.userId, userId),
                        eq(subscriptions.currency, currency),
                        eq(subscriptions.active, true),
                    ),
                )
                .then((res) => Number(res[0]?.value ?? 0)),

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
                        ),
                    );

                return result[0]?.value ?? 0;
            })(),
        ]);

        // ---------- Aggregations ----------
        const totalSpendCurrent = expenseCurrent + subsCurrent;

        const incomeGrowth = incomePrevious
            ? ((incomeCurrent - incomePrevious) / incomePrevious) * 100
            : 0;

        const activeSubsGrowth = activeSubsPrevious
            ? ((activeSubsCurrent - activeSubsPrevious) / activeSubsPrevious) *
              100
            : 0;

        // ---------- Response ----------
        return NextResponse.json({
            totalSpend: totalSpendCurrent,
            activeSubscriptions: activeSubsCurrent,
            totalIncome: incomeCurrent,
            growth: {
                income: Number(incomeGrowth.toFixed(1)),
                activeSubscriptions: Number(activeSubsGrowth.toFixed(1)),
                // totalSpend growth can be added later
            },
        });
    } catch (error) {
        console.error("Stats API Error:", error);
        return NextResponse.json(
            { message: "Internal server error" },
            { status: 500 },
        );
    }
};
