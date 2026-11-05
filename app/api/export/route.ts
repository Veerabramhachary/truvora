import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import { getFeatureLimit, tryConsumeFeature } from "@/lib/feature-access";
import { checkRateLimits, rateLimitResponse } from "@/lib/rate-limit";
import { ledgerErrorResponse, requireLedger } from "@/lib/ledger";
import { activeSubscriptionFlag } from "@/lib/active-subscription";
import { displayCategoryName } from "@/lib/categories";
import { formatMoney, summariseRecords, type ReportRecord } from "@/lib/report-summary";
import { TAX_KIND_LABELS, type TaxKind } from "@/lib/tax";
import { toPaise } from "@/lib/money";
import {
    andAll,
    buildFilterConditions,
    matchesText,
    MAX_SEARCH_SCAN,
    parseRecordFilters,
    type RecordFilters,
} from "@/lib/transaction-filters";
import type { PdfColumn } from "@/lib/pdf-report";

/**
 * CSV and PDF export for the Exports feature gate.
 *
 * `?type=transactions|expenses|subscriptions`, `&format=csv|pdf` (default csv).
 * Transactions and expenses accept the same filters as the lists (`q`,
 * `recordType`, `categoryId`, `currency`, `from`, `to`, `minAmount`,
 * `maxAmount`); with none
 * the whole ledger is exported, as before. `tzOffset` (minutes, JavaScript's
 * getTimezoneOffset) makes dates match the user's own calendar; without it
 * they are UTC dates, as they always were.
 *
 * Every exported field is a value we wrote (no `note`/`description`), so
 *    the AES-encrypted columns can never reach the response body. (Text search
 *    decrypts rows in memory to match them, but never returns them.)
 *
 * PDF: allowed only when the plan's `exportFormats.pdf` is on; Starter gets
 * the basic table, Pro (`pdfLevel: "advanced"`) also gets the summary.
 */

const SOURCES = ["subscriptions", "expenses", "transactions"] as const;
type Source = (typeof SOURCES)[number];

/** A PDF this long is already well over a hundred pages. */
const PDF_MAX_ROWS = 2000;

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

function parseTzOffset(raw: string | null): number {
    const value = Number(raw);
    return raw !== null && Number.isInteger(value) && value >= -840 && value <= 840 ? value : 0;
}

/** `YYYY-MM-DD` in the caller's time zone (UTC when no offset was sent). */
function formatDate(value: Date | string | null | undefined, tzOffset = 0): string {
    if (!value) return "";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return new Date(date.getTime() - tzOffset * 60_000).toISOString().slice(0, 10);
}

function formatDateTime(value: Date, tzOffset: number): string {
    return new Date(value.getTime() - tzOffset * 60_000).toISOString().slice(0, 16).replace("T", " ");
}

function formatAmount(value: string | null | undefined): string {
    if (!value) return "0.00";
    const amount = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!amount) return value;
    const fraction = amount[3] ?? "";
    return `${amount[1]}${amount[2]}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function pdfAmount(value: string | null | undefined, currency: string): string {
    const normalised = formatAmount(value);
    try {
        return formatMoney(toPaise(normalised), currency);
    } catch {
        return `${currency} ${normalised}`;
    }
}

const capitalise = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

function describeFilters(
    filters: RecordFilters,
    tzOffset: number,
    categoryNames: string[],
): string[] {
    const lines: string[] = [];
    if (filters.q) lines.push(`Search: "${filters.q}"`);
    if (filters.types) lines.push(`Type: ${filters.types.map(capitalise).join(", ")}`);
    if (categoryNames.length > 0) lines.push(`Category: ${categoryNames.join(", ")}`);
    if (filters.currency) lines.push(`Currency: ${filters.currency}`);
    if (filters.from || filters.to) {
        lines.push(
            `Dates: ${filters.from ? formatDate(filters.from, tzOffset) : "start"} to ${
                filters.to ? formatDate(filters.to, tzOffset) : "today"
            }`,
        );
    }
    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
        lines.push(`Amount: ${filters.minAmount ?? "0"} to ${filters.maxAmount ?? "any"}`);
    }
    return lines.length > 0 ? lines : ["All records"];
}

export async function GET(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const limited = rateLimitResponse(
            await checkRateLimits(`user:${userId}`, ["export"]),
        );
        if (limited) return limited;

        const ledger = await requireLedger(req, userId);

        const url = new URL(req.url);
        const source = url.searchParams.get("type");
        if (!SOURCES.includes(source as Source)) {
            return NextResponse.json(
                { error: "type must be one of: subscriptions, expenses, transactions" },
                { status: 400 },
            );
        }

        const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
        if (format !== "csv" && format !== "pdf") {
            return NextResponse.json({ error: "format must be csv or pdf" }, { status: 400 });
        }

        // The UI only hides the PDF button; the plan is enforced here.
        let pdfLevel: "basic" | "advanced" = "basic";
        if (format === "pdf") {
            const formats = await getFeatureLimit(userId, "exportFormats");
            if (!formats || typeof formats !== "object" || !("pdf" in formats) || !formats.pdf) {
                return NextResponse.json(
                    { error: "PDF export is not included in your plan" },
                    { status: 403 },
                );
            }
            pdfLevel = formats.pdfLevel === "advanced" ? "advanced" : "basic";
        }

        // The subscriptions list has no search or filters.
        const noFilters: { ok: true; filters: RecordFilters } = { ok: true, filters: {} };
        // `type` already names the export source above, so the record-type filter
        // arrives as `recordType`; the shared parser expects it called `type`.
        const filterParams = new URLSearchParams(url.searchParams);
        filterParams.delete("type");
        const recordType = url.searchParams.get("recordType");
        if (recordType !== null) filterParams.set("type", recordType);
        const parsedFilters =
            source === "subscriptions"
                ? noFilters
                : parseRecordFilters(
                      filterParams,
                      source === "expenses" ? ["income", "expense"] : ["income", "expense", "subscription"],
                  );
        if (!parsedFilters.ok) {
            return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
        }
        const { q, ...sqlFilters } = parsedFilters.filters;
        const tzOffset = parseTzOffset(url.searchParams.get("tzOffset"));

        const isPdf = format === "pdf";
        let headers: string[];
        let rows: unknown[][];

        // PDF-only pieces, filled in by whichever source was requested.
        let pdfTitle = "";
        let pdfColumns: PdfColumn[] = [];
        let pdfRows: string[][] = [];
        let pdfRecords: ReportRecord[] = [];
        let total = 0;
        let shown = 0;

        if (source === "subscriptions") {
            const ordered = db
                .select({
                    title: subscriptions.name,
                    price: subscriptions.price,
                    currency: subscriptions.currency,
                    interval: subscriptions.interval,
                    startDate: subscriptions.startDate,
                    nextDate: subscriptions.nextDate,
                    active: activeSubscriptionFlag(),
                    categoryName: sql<string | null>`COALESCE(${categories.displayName}, ${categories.name})`,
                })
                .from(subscriptions)
                .leftJoin(
                    categories,
                    eq(subscriptions.categoryId, categories.id),
                )
                .where(eq(subscriptions.ledgerId, ledger.id))
                .orderBy(desc(subscriptions.startDate));
            const fetched = isPdf ? await ordered.limit(PDF_MAX_ROWS + 1) : await ordered;
            const data = isPdf ? fetched.slice(0, PDF_MAX_ROWS) : fetched;
            shown = data.length;
            total = shown;
            if (isPdf && fetched.length > PDF_MAX_ROWS) {
                const [count] = await db
                    .select({ total: sql<number>`count(*)` })
                    .from(subscriptions)
                    .where(eq(subscriptions.ledgerId, ledger.id));
                total = Number(count?.total ?? shown);
            }

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
                formatDate(row.startDate, tzOffset),
                formatDate(row.nextDate, tzOffset),
                row.active ? "Active" : "Inactive",
                row.categoryName ?? "",
            ]);

            pdfTitle = "Subscriptions";
            pdfColumns = [
                { header: "Name", width: 4 },
                { header: "Category", width: 2.2 },
                { header: "Price", width: 2.4, align: "right" },
                { header: "Interval", width: 1.2 },
                { header: "Next date", width: 1.5 },
                { header: "Status", width: 1.2 },
            ];
            pdfRows = data.map((row) => [
                row.title ?? "",
                row.categoryName ? displayCategoryName(row.categoryName) : "",
                pdfAmount(row.price, row.currency),
                capitalise(row.interval),
                formatDate(row.nextDate, tzOffset),
                row.active ? "Active" : "Inactive",
            ]);
        } else if (source === "expenses") {
            const where = andAll([
                eq(expenses.ledgerId, ledger.id),
                ...buildFilterConditions(expenses, sqlFilters),
            ]);
            const ordered = db
                .select({
                    title: expenses.title,
                    type: expenses.type,
                    amount: expenses.amount,
                    currency: expenses.currency,
                    date: expenses.date,
                    taxKind: expenses.taxKind,
                    // Only read (and decrypted) when searching.
                    description: q ? expenses.note : sql<string | null>`NULL`,
                    categoryName: sql<string | null>`COALESCE(${categories.displayName}, ${categories.name})`,
                })
                .from(expenses)
                .leftJoin(categories, eq(expenses.categoryId, categories.id))
                .where(where)
                .orderBy(desc(expenses.date));
            const fetched = q
                ? await ordered.limit(MAX_SEARCH_SCAN + 1)
                : isPdf
                  ? await ordered.limit(PDF_MAX_ROWS + 1)
                  : await ordered;
            const matched = q
                ? fetched
                      .slice(0, MAX_SEARCH_SCAN)
                      .filter((row) => matchesText([row.title, row.description], q))
                : fetched;
            const data = isPdf ? matched.slice(0, PDF_MAX_ROWS) : matched;
            shown = data.length;
            total = matched.length;
            if (isPdf && !q && matched.length > PDF_MAX_ROWS) {
                const [count] = await db
                    .select({ total: sql<number>`count(*)` })
                    .from(expenses)
                    .where(where);
                total = Number(count?.total ?? shown);
            }

            headers = ["Date", "Description", "Category", "Type", "Amount", "Currency"];
            rows = data.map((row) => [
                formatDate(row.date, tzOffset),
                row.title,
                row.categoryName ?? "",
                row.type,
                formatAmount(row.amount),
                row.currency,
            ]);

            pdfTitle = "Expenses and income";
            const withTax = pdfLevel === "advanced" && ledger.type === "business";
            pdfColumns = [
                { header: "Date", width: 1.3 },
                { header: "Description", width: 4 },
                { header: "Category", width: 2.2 },
                { header: "Type", width: 1.2 },
                { header: "Amount", width: 2.4, align: "right" },
                ...(withTax ? [{ header: "Tax", width: 1.8 }] : []),
            ];
            pdfRows = data.map((row) => [
                formatDate(row.date, tzOffset),
                row.title ?? "",
                row.categoryName ? displayCategoryName(row.categoryName) : "",
                capitalise(row.type),
                pdfAmount(row.amount, row.currency),
                ...(withTax ? [row.taxKind ? TAX_KIND_LABELS[row.taxKind as TaxKind] : ""] : []),
            ]);
            pdfRecords = data.map((row) => ({
                type: row.type,
                amount: formatAmount(row.amount),
                currency: row.currency,
                category: row.categoryName ? displayCategoryName(row.categoryName) : null,
                taxKind: row.taxKind as TaxKind | null,
            }));
        } else {
            const where = andAll([
                eq(transactions.ledgerId, ledger.id),
                ...buildFilterConditions(transactions, sqlFilters),
            ]);
            const ordered = db
                .select({
                    title: transactions.title,
                    type: transactions.type,
                    action: transactions.action,
                    amount: transactions.amount,
                    currency: transactions.currency,
                    date: transactions.date,
                    createdAt: transactions.createdAt,
                    taxKind: transactions.taxKind,
                    // Only read (and decrypted) when searching.
                    description: q ? transactions.description : sql<string | null>`NULL`,
                    categoryName: sql<string | null>`COALESCE(${categories.displayName}, ${categories.name})`,
                })
                .from(transactions)
                .leftJoin(
                    categories,
                    eq(transactions.categoryId, categories.id),
                )
                .where(where)
                .orderBy(desc(transactions.createdAt));
            const fetched = q
                ? await ordered.limit(MAX_SEARCH_SCAN + 1)
                : isPdf
                  ? await ordered.limit(PDF_MAX_ROWS + 1)
                  : await ordered;
            const matched = q
                ? fetched
                      .slice(0, MAX_SEARCH_SCAN)
                      .filter((row) => matchesText([row.title, row.description], q))
                : fetched;
            const data = isPdf ? matched.slice(0, PDF_MAX_ROWS) : matched;
            shown = data.length;
            total = matched.length;
            if (isPdf && !q && matched.length > PDF_MAX_ROWS) {
                const [count] = await db
                    .select({ total: sql<number>`count(*)` })
                    .from(transactions)
                    .where(where);
                total = Number(count?.total ?? shown);
            }

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
                formatDate(row.date, tzOffset),
                row.title,
                row.categoryName ?? "",
                row.type,
                row.action,
                formatAmount(row.amount),
                row.currency,
                formatDate(row.createdAt, tzOffset),
            ]);

            pdfTitle = "Transactions";
            const withTax = pdfLevel === "advanced" && ledger.type === "business";
            pdfColumns = [
                { header: "Date", width: 1.3 },
                { header: "Description", width: 4 },
                { header: "Category", width: 2.2 },
                { header: "Type", width: 1.4 },
                { header: "Amount", width: 2.4, align: "right" },
                ...(withTax ? [{ header: "Tax", width: 1.8 }] : []),
            ];
            pdfRows = data.map((row) => [
                formatDate(row.date, tzOffset),
                row.title ?? "",
                row.categoryName ? displayCategoryName(row.categoryName) : "",
                capitalise(row.type),
                pdfAmount(row.amount, row.currency),
                ...(withTax ? [row.taxKind ? TAX_KIND_LABELS[row.taxKind as TaxKind] : ""] : []),
            ]);
            pdfRecords = data.map((row) => ({
                type: row.type,
                amount: formatAmount(row.amount),
                currency: row.currency,
                category: row.categoryName ? displayCategoryName(row.categoryName) : null,
                taxKind: row.taxKind as TaxKind | null,
            }));
        }

        const stamp = new Date().toISOString().slice(0, 10);
        const safeHeaders = {
            // Never let an export be embedded or fetched cross-origin.
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        };

        if (isPdf) {
            let categoryNames: string[] = [];
            if (sqlFilters.categoryIds) {
                const found = await db
                    .select({ name: categories.name, displayName: categories.displayName })
                    .from(categories)
                    .where(inArray(categories.id, sqlFilters.categoryIds));
                categoryNames = found.map((c) => displayCategoryName(c.displayName ?? c.name));
            }

            // Loaded on demand so plain CSV exports never pay for the PDF library.
            const { buildReportPdf } = await import("@/lib/pdf-report");
            const advanced = pdfLevel === "advanced";
            const bytes = await buildReportPdf({
                title: pdfTitle,
                ledgerName: ledger.name,
                ledgerType: ledger.type,
                generatedLabel: formatDateTime(new Date(), tzOffset),
                level: pdfLevel,
                filterLines:
                    source === "subscriptions"
                        ? ["All subscriptions in this ledger"]
                        : describeFilters(parsedFilters.filters, tzOffset, categoryNames),
                columns: pdfColumns,
                rows: pdfRows,
                summary:
                    advanced && source !== "subscriptions"
                        ? summariseRecords(pdfRecords, { includeTax: ledger.type === "business" })
                        : undefined,
                truncatedNote:
                    total > shown
                        ? `Showing ${shown.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} records. Narrow the dates or filters to see the rest.`
                        : undefined,
            });

            // The UI gate is only a convenience. Enforce and record each export
            // here so direct API requests cannot bypass the plan limit.
            const allowed = await tryConsumeFeature(userId, "exports");
            if (!allowed) {
                return NextResponse.json(
                    { error: "Export limit reached for your plan" },
                    { status: 403 },
                );
            }

            return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `attachment; filename="truvora-${ledger.type}-${source}-${stamp}.pdf"`,
                    ...safeHeaders,
                },
            });
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

        return new Response(`\uFEFF${toCsv(headers, rows)}`, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="truvora-${ledger.type}-${source}-${stamp}.csv"`,
                ...safeHeaders,
            },
        });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Export failed:", error);
        return NextResponse.json(
            { error: "Could not export your data" },
            { status: 500 },
        );
    }
}
