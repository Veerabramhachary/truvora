import { auth } from "@clerk/nextjs/server";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { transactions } from "@/db/schema/schema";
import { ledgerErrorResponse, requireLedger } from "@/lib/ledger";
import { summariseTax, type TaxKind } from "@/lib/tax";

/** Safety cap: tax-tagged records in one tax year are far below this. */
const MAX_ROWS = 20_000;
const MAX_RANGE_DAYS = 400;

const querySchema = z.object({
    // Exact instants: the browser sends the start and end of the tax year in
    // the user's own time zone (April to March).
    from: z.coerce.date(),
    to: z.coerce.date(),
    // Minutes behind UTC, as JavaScript's getTimezoneOffset (India is -330).
    // Only used to put each record in the right month.
    tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
    currency: z
        .string()
        .regex(/^[A-Za-z]{3}$/)
        .transform((value) => value.toUpperCase())
        .default("INR"),
});

/**
 * Tax summary for the current BUSINESS ledger: totals by tax type and a
 * month-by-month series for the requested range. Reads the ledger's
 * transactions, so renewals recorded by the daily job are included.
 */
export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const ledger = await requireLedger(req, userId);
        if (ledger.type !== "business") {
            return NextResponse.json(
                { error: "Tax tracking is only available for business ledgers" },
                { status: 403 },
            );
        }

        const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? "Invalid request" },
                { status: 400 },
            );
        }
        const { from, to, tzOffset, currency } = parsed.data;
        if (from > to) {
            return NextResponse.json({ error: "The from date is after the to date" }, { status: 400 });
        }
        if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
            return NextResponse.json({ error: "Choose a range of one year or less" }, { status: 400 });
        }

        const rows = await db
            .select({
                date: transactions.date,
                amount: transactions.amount,
                taxKind: transactions.taxKind,
            })
            .from(transactions)
            .where(
                and(
                    eq(transactions.ledgerId, ledger.id),
                    isNotNull(transactions.taxKind),
                    eq(transactions.currency, currency),
                    gte(transactions.date, from),
                    lte(transactions.date, to),
                ),
            )
            .orderBy(asc(transactions.date))
            .limit(MAX_ROWS + 1);

        const truncated = rows.length > MAX_ROWS;
        const summary = summariseTax(
            rows.slice(0, MAX_ROWS).map((row) => ({
                date: row.date,
                amount: row.amount,
                taxKind: row.taxKind as TaxKind,
            })),
            { from, to },
            tzOffset,
        );

        return NextResponse.json({
            currency,
            from: from.toISOString(),
            to: to.toISOString(),
            truncated,
            ...summary,
        });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Tax summary failed:", error);
        return NextResponse.json({ error: "Could not load the tax summary" }, { status: 500 });
    }
}
