import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import { tryConsumeFeature } from "@/lib/feature-access";

/**
 * CSV export for the Exports feature gate.
 *
 * Every exported field is a value we wrote (no `note`/`description`), so
 *    the AES-encrypted columns can never reach the response body.
 */

const SOURCES = ["subscriptions", "expenses", "transactions"] as const;
type Source = (typeof SOURCES)[number];

function csvCell(value: unknown): string {
    let text = value === null || value === undefined ? "" : String(value);
    // Excel/LibreOffice interpret these leading characters as formulas even
    // when the cell is otherwise correctly quoted. Prefix an apostrophe so
    // spreadsheet imports treat user-controlled values as literal text.
    const numericLiteral = typeof value === "number" ||
        (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value));
    if (!numericLiteral && /^[\u0000-\u0020]*[=+\-@＝＋－＠]/u.test(text)) text = `'${text}`;
    // Always quote fields for predictable spreadsheet import, and escape
    // embedded quotes using the RFC 4180 doubled-quote convention.
    return `"${text.replace(/"/g, '""')}"`;
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

function formatAmount(value: string | null | undefined): string {
    if (!value) return "0.00";
    const amount = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!amount) return value;
    const fraction = amount[3] ?? "";
    return `${amount[1]}${amount[2]}.${fraction.padEnd(2, "0").slice(0, 2)}`;
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
                { error: "type must be one of: subscriptions, expenses, transactions" },
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
                "Description",
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
                formatAmount(row.price),
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

            headers = ["Date", "Description", "Category", "Type", "Amount", "Currency"];
            rows = data.map((row) => [
                formatDate(row.date),
                row.title,
                row.categoryName ?? "",
                row.type,
                formatAmount(row.amount),
                row.currency,
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
                "Date",
                "Description",
                "Category",
                "Type",
                "Action",
                "Amount",
                "Currency",
                "Recorded",
            ];
            rows = data.map((row) => [
                formatDate(row.date),
                row.title,
                row.categoryName ?? "",
                row.type,
                row.action,
                formatAmount(row.amount),
                row.currency,
                formatDate(row.createdAt),
            ]);
        }

        // The UI gate is only a convenience. Enforce and record each export
        // here so direct API requests cannot bypass the plan limit.
        const allowed = await tryConsumeFeature(userId, "exports");
        if (!allowed) {
            return NextResponse.json(
                { error: "Export limit reached for your plan" },
                { status: 403 },
            );
        }

        const stamp = new Date().toISOString().slice(0, 10);
        return new Response(`\uFEFF${toCsv(headers, rows)}`, {
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
