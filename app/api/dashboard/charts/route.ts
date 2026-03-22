import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { subscriptions } from "@/db/schema/schema";
import { auth } from "@clerk/nextjs/server";
import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const querySchema = z.object({
    currency: z.string().default("USD"),
});

export const GET = async (request: NextRequest) => {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ message: "Unauthorized" });

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

        const now = new Date();
        // Set date to first day of the current month
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

        const endOfPreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
        );
        endOfPreviousMonth.setHours(0, 0, 0, 0);

        // Fetch data concurrently using Promise.all
        const [
            activeSubsCurrent,
            incomeCurrent,
            incomePrevious,
            expenseCurrent,
            expensePrevious,
            subsCurrent,
            activeSubsPrevious,
        ] = await Promise.all([
            // Active subscriptions count
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

            // Income Spending this month
            db
                .select({
                    value: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
                })
                .from(expenses)
                .where(
                    and(
                        eq(expenses.userId, userId),
                        eq(expenses.currency, currency),
                        eq(expenses.type, "income"),
                        gte(expenses.date, startOfCurrentMonth),
                        lt(expenses.date, endOfPreviousMonth),
                    ),
                )
                .then((res) => Number(res[0]?.value ?? 0)),

            // Total Income of previous month
            db
                .select({
                    value: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
                })
                .from(expenses)
                .where(
                    and(
                        eq(expenses.userId, userId),
                        eq(expenses.currency, currency),
                        eq(expenses.type, "income"),
                        gte(expenses.date, startOfPreviousMonth),
                        lt(expenses.date, startOfCurrentMonth),
                    ),
                )
                .then((res) => Number(res[0]?.value ?? 0)),

            // Expenses current month
            db
                .select({
                    value: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
                })
                .from(expenses)
                .where(
                    and(
                        eq(expenses.userId, userId),
                        eq(expenses.currency, currency),
                        eq(expenses.type, "expense"),
                        gte(expenses.date, startOfCurrentMonth),
                        lt(expenses.date, endOfPreviousMonth),
                    ),
                )
                .then((res) => Number(res[0]?.value ?? 0)),
            // subscription total spend (current month)
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
            // expense previous
            db
                .select({
                    value: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
                })
                .from(expenses)
                .where(
                    and(
                        eq(expenses.userId, userId),
                        eq(expenses.currency, currency),
                        eq(expenses.type, "expense"),
                        gte(expenses.date, startOfPreviousMonth),
                        lt(expenses.date, startOfCurrentMonth),
                    ),
                )
                .then((res) => Number(res[0]?.value ?? 0)),
            // subscription total spend (current month)
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

            //  Active subscriptions count in previous month
            // This is an approximation: count subscriptions that were created before end of previous month and not deactivated before then.
            // If you don't track deactivation dates, you can omit or use a simpler method.
            db
                .select({ value: count() })
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.userId, userId),
                        eq(subscriptions.currency, currency),
                        eq(subscriptions.active, true), // assumes they are still active now; this is not accurate for past
                        // If you have a `deactivatedAt` or `endDate`, use that instead.
                    ),
                )
                .then((res) => res[0]?.value ?? 0), // This is actually the same as current; replace with proper logic.
        ]);

        const totalSpendCurrent = expenseCurrent + subsCurrent;
        const totalSpendPrevious = expensePrevious + subsPrevious;

        const incomeGrowth = incomePrevious
            ? ((incomeCurrent - incomePrevious) / incomePrevious) * 100
            : 0;

        const activeSubsGrowth = activeSubsPrevious
            ? ((activeSubsCurrent - activeSubsPrevious) / activeSubsPrevious) * 100
            : 0;

        // Return aggregated data
        return NextResponse.json({
            totalSpend: totalSpendCurrent,
            activeSubscriptions: activeSubsCurrent,
            totalIncome: incomeCurrent,
            growth: {
                income: Number(incomeGrowth.toFixed(1)),
                activeSubscriptions: Number(activeSubsGrowth.toFixed(1)),
                // totalSpend: ... (if you add previous month expense query)
            },
        });
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json(
            { message: "Internal server error" },
            { status: 500 },
        );
    }
};
