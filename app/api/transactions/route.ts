import { db } from "@/db";
import { categories, transactions } from "@/db/schema/schema";
import { auth } from "@clerk/nextjs/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * `@refinedev/simple-rest` sends `_start`/`_end`/`_sort`/`_order` and reads the
 * row count back out of the `X-Total-Count` header — the body has to stay a
 * bare array. Returning `{ data, total }` here silently breaks pagination,
 * because Refine sees a "total" of 1 and a page full of unrelated objects.
 */
const SORTABLE = {
    id: transactions.id,
    amount: transactions.amount,
    type: transactions.type,
    date: transactions.date,
    createdAt: transactions.createdAt,
} as const;

export async function GET(req: NextRequest) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const params = req.nextUrl.searchParams;

        // Clamp so a crafted query can't request the whole table in one go.
        const requestedStart = Number(params.get("_start") ?? "0");
        const requestedEnd = Number(params.get("_end") ?? "10");
        const start = Number.isFinite(requestedStart)
            ? Math.max(0, Math.trunc(requestedStart))
            : 0;
        const end =
            Number.isFinite(requestedEnd) && requestedEnd > start
                ? Math.min(Math.trunc(requestedEnd), start + 100)
                : start + 10;

        const sortKey = params.get("_sort") ?? "createdAt";
        const column =
            SORTABLE[sortKey as keyof typeof SORTABLE] ??
            transactions.createdAt;
        const order =
            (params.get("_order") ?? "asc").toLowerCase() === "desc"
                ? desc
                : asc;

        const forUser = eq(transactions.userId, userId);

        const countRow = await db
            .select({ total: sql<number>`count(*)` })
            .from(transactions)
            .where(forUser);
        const total = Number(countRow[0]?.total ?? 0);

        const rows = await db
            .select({
                id: transactions.id,
                title: transactions.title,
                amount: transactions.amount,
                type: transactions.type,
                currency: transactions.currency,
                createdAt: transactions.createdAt,
                category: {
                    id: categories.id,
                    name: categories.name,
                    color: categories.color,
                },
                date: transactions.date,
            })
            .from(transactions)
            .leftJoin(categories, eq(transactions.categoryId, categories.id))
            .where(forUser)
            .orderBy(order(column))
            .limit(end - start)
            .offset(start);

        return NextResponse.json(rows, {
            headers: { "X-Total-Count": String(total) },
        });
    } catch (error) {
        console.error("Error fetching transactions:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
