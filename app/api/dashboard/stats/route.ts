import { db } from "@/db";
import { transactions, subscriptions } from "@/db/schema/schema";
import { auth } from "@clerk/nextjs/server";
import { and, asc, count, eq, gte, lt, lte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import { toPaise } from "@/lib/money";
import { ledgerErrorResponse, requireLedger } from "@/lib/ledger";
import { activeSubscriptionAt, activeSubscriptionNow } from "@/lib/active-subscription";

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

        const ledger = await requireLedger(request, userId);

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

        // Renewal window for the "Upcoming subscriptions" dashboard card:
        // from the start of today through the end of the 7th day ahead.
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfUpcomingWindow = new Date(now);
        endOfUpcomingWindow.setDate(now.getDate() + 7);
        endOfUpcomingWindow.setHours(23, 59, 59, 999);

        // ---------- Parallel data fetching ----------
        const [
            activeSubsCurrent,
            incomeCurrent,
            incomePrevious,
            expenseCurrent,
            subsCurrent,
            activeSubsPrevious,
            upcomingRenewals,
        ] = await Promise.all([
            // 1. Current active subscriptions count
            db
                .select({ value: count() })
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.ledgerId, ledger.id),
                        eq(subscriptions.currency, currency),
                        activeSubscriptionNow(now),
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
                        eq(transactions.ledgerId, ledger.id),
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
                        eq(transactions.ledgerId, ledger.id),
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
                        eq(transactions.ledgerId, ledger.id),
                        eq(transactions.currency, currency),
                        eq(transactions.type, "expense"),
                        eq(transactions.action, "created"),
                        gte(transactions.date, startOfCurrentMonth),
                        lt(transactions.date, startOfNextMonth), // FIXED
                    ),
                )
                .then((res) => String(res[0]?.value ?? "0")),

            // 6. Subscriptions total monthly spend (current active)
            db
                .select({
                    value: sql<string>`COALESCE(SUM(ROUND(${subscriptions.price} / (CASE WHEN ${subscriptions.interval} = 'year' THEN 12 ELSE 1 END * ${subscriptions.intervalCount}), 2)), 0)::text`,
                })
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.ledgerId, ledger.id),
                        eq(subscriptions.currency, currency),
                        activeSubscriptionNow(now),
                    ),
                )
                .then((res) => String(res[0]?.value ?? "0")),

            // 8. Active subscriptions at the end of the previous month, judged
            // from dates only (the `active` flag has no history).
            db
                .select({ value: count() })
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.ledgerId, ledger.id),
                        eq(subscriptions.currency, currency),
                        activeSubscriptionAt(startOfCurrentMonth),
                    ),
                )
                .then((res) => res[0]?.value ?? 0),

            // 9. Active subscriptions renewing between today and 7 days out,
            // nearest first, for the "Upcoming subscriptions" stat card.
            db
                .select({
                    name: subscriptions.name,
                    nextDate: subscriptions.nextDate,
                })
                .from(subscriptions)
                .where(and(
                    eq(subscriptions.ledgerId, ledger.id),
                    eq(subscriptions.currency, currency),
                    activeSubscriptionNow(now),
                    gte(subscriptions.nextDate, startOfToday),
                    lte(subscriptions.nextDate, endOfUpcomingWindow),
                ))
                .orderBy(asc(subscriptions.nextDate)),
        ]);

        // ---------- Aggregations ----------
        // Keep monetary arithmetic in integer paise until serialization so
        // large totals and fractional rupees do not accumulate float error.
        const incomeCurrentPaise = toPaise(incomeCurrent);
        const incomePreviousPaise = toPaise(incomePrevious);
        const expenseCurrentPaise = toPaise(expenseCurrent);
        const subscriptionSpendPaise = toPaise(subsCurrent);
        const totalSpendPaise = expenseCurrentPaise + subscriptionSpendPaise;
        const totalSpendCurrent = Number(totalSpendPaise) / 100;

        const incomeGrowth = incomePreviousPaise > BigInt(0)
            ? (Number(incomeCurrentPaise - incomePreviousPaise) / Number(incomePreviousPaise)) * 100
            : 0;

        const activeSubsGrowth = activeSubsPrevious
            ? ((activeSubsCurrent - activeSubsPrevious) / activeSubsPrevious) *
              100
            : 0;

        // ---------- Response ----------
        const nextRenewal = upcomingRenewals[0];
        return NextResponse.json({
            totalSpend: totalSpendCurrent,
            activeSubscriptions: activeSubsCurrent,
            totalIncome: Number(incomeCurrentPaise) / 100,
            upcomingSubscriptions: upcomingRenewals.length,
            nextRenewal: nextRenewal
                ? {
                    name: nextRenewal.name ?? "Subscription",
                    date: nextRenewal.nextDate,
                }
                : null,
            growth: {
                income: Number(incomeGrowth.toFixed(1)),
                activeSubscriptions: Number(activeSubsGrowth.toFixed(1)),
            },
        });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        return NextResponse.json(
            { message: "Internal server error" },
            { status: 500 },
        );
    }
};
