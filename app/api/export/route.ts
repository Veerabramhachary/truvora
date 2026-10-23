import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { categories, subscriptions, transactions } from "@/db/schema/schema";

/**
 * CSV export for the Exports feature gate.
 *
 * Two things to note:
 *  - The gate is enforced client-side by <FeatureGate>. Billing isn't live yet,
 *    so the server only requires a session; wire the real check in here once
 *    plans are purchasable.
 *  - Every exported field is a value we wrote (no `note`/`description`), so
 *    the AES-encrypted columns can never reach the response body.
 */

const SOURCES = ["subscriptions", "expenses", "transactions"] as const;
type Source = (typeof SOURCES)[number];

function csvCell(value: unknown): string {
    const text = value === null || value === undefined ? "" : String(value);
    // Quote anything that would otherwise break a row, and escape quotes.
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
    return [
        headers.map(csvCell).join(","),
        ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\r\n");
}

function formatDate(value: Date | string | null | undefined): string {
    if (!value) return "";
    const date = new Date(value);
    return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const source = new URL(req.url).searchParams.get("type");
        if (!SOURCES.includes(source as Source)) {
            return NextResponse.json(
                { error: "type must be one of: subscriptions, expenses" },
                { status: 400 },
            );
        }

        let headers: string[];
        let rows: unknown[][];

        if (source === "subscriptions") {
            const data = await db
                .select({
                    title: subscriptions.name,
                    price: subscriptions.price,
                    currency: subscriptions.currency,
                    interval: subscriptions.interval,
                    startDate: subscriptions.startDate,
                    nextDate: subscriptions.nextDate,
                    active: subscriptions.active,
                    categoryName: categories.name,
                })
                .from(subscriptions)
                .leftJoin(
                    categories,
                    eq(subscriptions.categoryId, categories.id),
                )
                .where(eq(subscriptions.userId, userId))
                .orderBy(desc(subscriptions.startDate));

            headers = [
                "Title",
                "Price",
                "Currency",
                "Interval",
                "Start date",
                "Next date",
                "Status",
                "Category",
            ];
            rows = data.map((row) => [
                row.title,
                row.price,
                row.currency,
                row.interval,
                formatDate(row.startDate),
                formatDate(row.nextDate),
                row.active ? "Active" : "Inactive",
                row.categoryName ?? "",
            ]);
        } else if (source === "expenses") {
            const data = await db
                .select({
                    title: expenses.title,
                    type: expenses.type,
                    amount: expenses.amount,
                    currency: expenses.currency,
                    date: expenses.date,
                    categoryName: categories.name,
                })
                .from(expenses)
                .leftJoin(categories, eq(expenses.categoryId, categories.id))
                .where(eq(expenses.userId, userId))
                .orderBy(desc(expenses.date));

            headers = ["Title", "Type", "Amount", "Currency", "Date", "Category"];
            rows = data.map((row) => [
                row.title,
                row.type,
                row.amount,
                row.currency,
                formatDate(row.date),
                row.categoryName ?? "",
            ]);
        } else {
            const data = await db
                .select({
                    title: transactions.title,
                    type: transactions.type,
                    action: transactions.action,
                    amount: transactions.amount,
                    currency: transactions.currency,
                    date: transactions.date,
                    createdAt: transactions.createdAt,
                    categoryName: categories.name,
                })
                .from(transactions)
                .leftJoin(
                    categories,
                    eq(transactions.categoryId, categories.id),
                )
                .where(eq(transactions.userId, userId))
                .orderBy(desc(transactions.createdAt));

            headers = [
                "Title",
                "Type",
                "Action",
                "Amount",
                "Currency",
                "Date",
                "Recorded",
                "Category",
            ];
            rows = data.map((row) => [
                row.title,
                row.type,
                row.action,
                row.amount,
                row.currency,
                formatDate(row.date),
                formatDate(row.createdAt),
                row.categoryName ?? "",
            ]);
        }

        const stamp = new Date().toISOString().slice(0, 10);
        return new Response(toCsv(headers, rows), {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="truvora-${source}-${stamp}.csv"`,
                // Never let a CSV be embedded or fetched cross-origin.
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'",
            },
        });
    } catch (error) {
        console.error("Export failed:", error);
        return NextResponse.json(
            { error: "Could not export your data" },
            { status: 500 },
        );
    }
}
