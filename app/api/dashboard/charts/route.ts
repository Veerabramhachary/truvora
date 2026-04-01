import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { subscriptions } from "@/db/schema/schema";
import { auth } from "@clerk/nextjs/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const querySchema = z.object({
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime(),
    currency: z.string().default("USD"),
});

export const GET = async (request: NextRequest) => {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const query = querySchema.safeParse({
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
        currency: searchParams.get("currency") ?? undefined,
    });

    if (!query.success) {
        return NextResponse.json(
            { error: "Invalid parameters", details: query.error.flatten() },
            { status: 400 },
        );
    }

    const { startDate, endDate, currency } = query.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Query expenses (both income and expense? – we only need expense type)
    const expenseData = await db
        .select({
            date: expenses.date,
            amount: sql<number>`COALESCE(SUM(${expenses.amount}), 0) AS FLOAT`,
        })
        .from(expenses)
        .where(
            and(
                eq(expenses.userId, userId),
                eq(expenses.currency, currency),
                eq(expenses.type, "expense"),
                gte(expenses.date, start),
                lte(expenses.date, end),
            ),
        )
        .groupBy(expenses.date)

    
    const subscriptionData = await db
        .select({
            date: subscriptions.startDate,
            amount: sql<number>`COALESCE(SUM(${subscriptions.price}), 0)::FLOAT`,
        })
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.userId, userId),
                eq(subscriptions.currency, currency),
                eq(subscriptions.active, true),
                lte(subscriptions.startDate, end)
            ),
        )
        .groupBy(subscriptions.startDate)

    // Combine into a map of date -> { expense, subscription }
    const resultMap = new Map<
        string,
        { expense: number; subscription: number }
    >();
    expenseData.forEach((row) => {
        const dateKey = row.date.toISOString().split("T")[0];
        resultMap.set(dateKey, {
            expense: row.amount,
            subscription: resultMap.get(dateKey)?.subscription ?? 0,
        });
    });
    subscriptionData.forEach((row) => {
        const dateKey = row.date.toISOString().split("T")[0];
        const existing = resultMap.get(dateKey) ?? {
            expense: 0,
            subscription: 0,
        };
        resultMap.set(dateKey, {
            ...existing,
            subscription: existing.subscription + row.amount,
        });
    });

    // Fill missing dates in the range and produce a sorted array
    const dates = [];
    const current = new Date(start);
    while (current <= end) {
        const dateKey = current.toISOString().split("T")[0];
        const data = resultMap.get(dateKey) ?? { expense: 0, subscription: 0 };
        dates.push({
            date: dateKey,
            expense: data.expense,
            subscription: data.subscription,
        });
        current.setDate(current.getDate() + 1);
    }

    return NextResponse.json(dates);
};
