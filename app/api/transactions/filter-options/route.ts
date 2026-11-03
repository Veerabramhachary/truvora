import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema/schema";
import { ledgerErrorResponse, requireLedger } from "@/lib/ledger";

/**
 * Choices for the list filters: only categories and currencies that the
 * current ledger's records actually use, so every option returns results and
 * the dropdowns work on every plan (the categories API is a paid feature).
 */
export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const ledger = await requireLedger(req, userId);

        const [categoryRows, currencyRows] = await Promise.all([
            db
                .selectDistinct({
                    id: categories.id,
                    name: categories.name,
                    displayName: categories.displayName,
                })
                .from(transactions)
                .innerJoin(categories, eq(transactions.categoryId, categories.id))
                .where(eq(transactions.ledgerId, ledger.id)),
            db
                .selectDistinct({ currency: transactions.currency })
                .from(transactions)
                .where(eq(transactions.ledgerId, ledger.id)),
        ]);

        return NextResponse.json({
            categories: categoryRows
                .map((row) => ({ id: row.id, name: row.displayName ?? row.name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            currencies: currencyRows
                .map((row) => row.currency)
                .filter((currency): currency is string => Boolean(currency))
                .sort(),
        });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Error fetching filter options:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
