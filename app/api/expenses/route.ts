import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { asc, desc, eq, sql } from "drizzle-orm";
import { categories, transactions } from "@/db/schema/schema";
import { expenseSchema } from "./schema";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { resolveCategory } from "@/lib/category-access";
import { canUseFeature } from "@/lib/feature-access";
import { ledgerErrorResponse, requireLedger } from "@/lib/ledger";
import { validateTaxKind } from "@/lib/tax";
import {
    andAll,
    buildFilterConditions,
    matchesText,
    MAX_SEARCH_SCAN,
    parseRecordFilters,
} from "@/lib/transaction-filters";

/**
 * `@refinedev/simple-rest` sends `_start`/`_end`/`_sort`/`_order` and reads the
 * row count out of the `X-Total-Count` header. Ignoring them — and omitting the
 * header — left Refine with a total of 0, so `useList` reported an empty page
 * and the expenses screen broke as soon as it tried to paginate.
 *
 * The body stays a bare array; simple-rest parses it directly.
 */
const SORTABLE = {
    id: expenses.id,
    amount: expenses.amount,
    date: expenses.date,
    type: expenses.type,
    createdAt: expenses.createdAt,
} as const;

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const ledger = await requireLedger(req, userId);

        const params = req.nextUrl.searchParams;

        // Clamp so a crafted query can't request the whole table at once.
        const requestedStart = Number(params.get("_start") ?? "0");
        const requestedEnd = Number(params.get("_end") ?? "10");
        const start = Number.isFinite(requestedStart)
            ? Math.max(0, Math.trunc(requestedStart))
            : 0;
        const end =
            Number.isFinite(requestedEnd) && requestedEnd > start
                ? Math.min(Math.trunc(requestedEnd), start + 100)
                : start + 10;

        const sortKey = params.get("_sort") ?? "date";
        const column =
            SORTABLE[sortKey as keyof typeof SORTABLE] ?? expenses.date;
        const order =
            (params.get("_order") ?? "desc").toLowerCase() === "asc"
                ? asc
                : desc;

        // Filters (F-05). Everything but free-text search runs in SQL; titles
        // and notes are encrypted at rest, so text search decrypts in the app
        // over rows that already passed the SQL filters (capped).
        const parsed = parseRecordFilters(params, ["income", "expense"]);
        if (!parsed.ok) {
            return NextResponse.json({ error: parsed.error }, { status: 400 });
        }
        const { q, ...sqlFilters } = parsed.filters;
        const where = andAll([
            eq(expenses.ledgerId, ledger.id),
            ...buildFilterConditions(expenses, sqlFilters),
        ]);

        const selection = {
            // Refine's simple-rest provider requires every list item to
            // expose its primary key as `id`. Returning this as
            // `expenseId` left the UI without stable record identifiers,
            // which prevented the list from rendering reliably and made
            // edit/delete requests target `undefined`.
            id: expenses.id,
            title: expenses.title,
            type: expenses.type,
            amount: expenses.amount,
            date: expenses.date,
            description: expenses.note,
            categoryId: expenses.categoryId,
            categoryName: sql`COALESCE(${categories.displayName}, ${categories.name})`,
            currency: expenses.currency,
            taxKind: expenses.taxKind,
        };

        if (q) {
            const scanned = await db
                .select(selection)
                .from(expenses)
                .leftJoin(categories, eq(expenses.categoryId, categories.id))
                .where(where)
                .orderBy(order(column))
                .limit(MAX_SEARCH_SCAN + 1);
            const truncated = scanned.length > MAX_SEARCH_SCAN;
            const matches = scanned
                .slice(0, MAX_SEARCH_SCAN)
                .filter((row) => matchesText([row.title, row.description], q));
            return NextResponse.json(matches.slice(start, end), {
                status: 200,
                headers: {
                    "X-Total-Count": String(matches.length),
                    "X-Search-Truncated": String(truncated),
                },
            });
        }

        const countRow = await db
            .select({ total: sql<number>`count(*)` })
            .from(expenses)
            .where(where);
        const total = Number(countRow[0]?.total ?? 0);

        const data = await db
            .select(selection)
            .from(expenses)
            .leftJoin(categories, eq(expenses.categoryId, categories.id))
            .where(where)
            .orderBy(order(column))
            .limit(end - start)
            .offset(start);

        return NextResponse.json(data, {
            status: 200,
            headers: { "X-Total-Count": String(total) },
        });
    } catch (err) {
        const ledgerResponse = ledgerErrorResponse(err);
        if (ledgerResponse) return ledgerResponse;
        console.error("Failed to fetch expenses:", err);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 },
        );
    }
}

export const POST = async (req: Request) => {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({error:"Unauthorized"}, { status: 401 });
        }
        const ledger = await requireLedger(req, userId);

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid JSON body" },
                { status: 400 },
            );
        }
        const data = expenseSchema.parse(body);
        if (data.currency !== "INR") {
            return NextResponse.json({ error: "New financial records must use INR" }, { status: 400 });
        }

        const taxError = validateTaxKind({
            ledgerType: ledger.type,
            recordType: data.type,
            taxKind: data.taxKind,
        });
        if (taxError) {
            return NextResponse.json({ success: false, error: taxError }, { status: 400 });
        }

        const category = await resolveCategory(
            ledger.id,
            data.category,
            data.type === "expense" ? "expense" : null,
        );
        if (!category) {
            return NextResponse.json(
                        { error: "Category not found" },
                        { status: 404 },
                    );
        }
        if (category.isCustom && !(await canUseFeature(userId, "customCategories"))) {
            return NextResponse.json(
                { error: "Upgrade your plan to use custom categories" },
                { status: 403 },
            );
        }

        await db.transaction(async (tx) => {
            const [expense] = await tx.insert(expenses).values({
                title: data.title,
                note: data.note,
                amount: data.amount,
                date: data.date,
                type: data.type,
                categoryId: category.id,
                userId: userId,
                ledgerId: ledger.id,
                currency: data.currency,
                taxKind: data.taxKind ?? null,
            }).returning({ id: expenses.id });

            await tx.insert(transactions).values({
                title: data.title,
                description: data.note,
                amount: data.amount,
                date: data.date,
                type: data.type,
                userId: userId,
                ledgerId: ledger.id,
                expenseId: expense.id,
                categoryId: category.id,
                action: "created",
                currency: data.currency,
                taxKind: data.taxKind ?? null,
                createdAt: new Date(),
            });
        });

        return Response.json({
            success: true,
        });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        error.issues[0]?.message ?? "Invalid expense data",
                },
                { status: 400 },
            );
        }
        console.error("Failed to create expense:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: "Internal server error",
            }),
            { status: 500 },
        );
    }
};
