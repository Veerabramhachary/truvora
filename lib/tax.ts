import { toPaise } from "@/lib/money";

/**
 * Tax tracking rules (F-05). Business ledgers only: "organize tax-related
 * income and expenses", not compute tax. Every rule lives here so the API,
 * forms and summary agree.
 */

// Keep in step with db/schema/tax.ts (a test asserts they match). Declared here
// as well so client components do not have to import the database schema.
export const TAX_KINDS = ["deductible", "tax_paid", "taxable_income", "tax_refund"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

export const TAX_KIND_LABELS: Record<TaxKind, string> = {
    deductible: "Tax-deductible",
    tax_paid: "Tax paid",
    taxable_income: "Taxable income",
    tax_refund: "Tax refund",
};

export type TaxRecordType = "expense" | "income" | "subscription";

const ALLOWED: Record<TaxRecordType, readonly TaxKind[]> = {
    expense: ["deductible", "tax_paid"],
    subscription: ["deductible", "tax_paid"],
    income: ["taxable_income", "tax_refund"],
};

export function allowedTaxKinds(recordType: TaxRecordType): readonly TaxKind[] {
    return ALLOWED[recordType];
}

/** null when the tag is acceptable, otherwise a message for the 400 response. */
export function validateTaxKind(args: {
    ledgerType: "personal" | "business";
    recordType: TaxRecordType;
    taxKind: TaxKind | null | undefined;
}): string | null {
    const { ledgerType, recordType, taxKind } = args;
    if (taxKind === null || taxKind === undefined) return null;
    if (ledgerType !== "business") {
        return "Tax tracking is only available for business ledgers";
    }
    if (!ALLOWED[recordType].includes(taxKind)) {
        return `"${TAX_KIND_LABELS[taxKind]}" does not apply to ${
            recordType === "income" ? "income" : recordType === "subscription" ? "a subscription" : "an expense"
        }`;
    }
    return null;
}

// ---- Tax year (April to March) -------------------------------------------
// These helpers use the LOCAL time zone and are meant for the browser: the
// client sends the exact instants to the API.

/** Calendar year in which the tax year containing `now` starts (1 April). */
export function currentTaxYearStart(now: Date = new Date()): number {
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

export function taxYearBounds(startYear: number): { from: Date; to: Date } {
    return {
        from: new Date(startYear, 3, 1, 0, 0, 0, 0),
        to: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
    };
}

export function taxYearLabel(startYear: number): string {
    return `FY ${startYear}–${String(startYear + 1).slice(2)}`;
}

// ---- Summary -------------------------------------------------------------

export type TaxRow = { date: Date; amount: string; taxKind: TaxKind };

export type TaxMonth = {
    key: string; // "2026-04"
    deductible: number;
    taxPaid: number;
    taxableIncome: number;
    taxRefund: number;
};

export type TaxSummary = {
    totals: {
        deductible: number;
        taxPaid: number;
        taxableIncome: number;
        taxRefund: number;
        /** Tax paid minus refunds received. */
        netTaxPaid: number;
    };
    counts: Record<TaxKind, number>;
    months: TaxMonth[];
};

/** `YYYY-MM` of an instant in a fixed UTC offset (JS `getTimezoneOffset` minutes). */
function monthKey(date: Date, tzOffsetMinutes: number): string {
    const local = new Date(date.getTime() - tzOffsetMinutes * 60_000);
    return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeysBetween(from: Date, to: Date, tzOffsetMinutes: number): string[] {
    const start = new Date(from.getTime() - tzOffsetMinutes * 60_000);
    const end = new Date(to.getTime() - tzOffsetMinutes * 60_000);
    const keys: string[] = [];
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth();
    const endIndex = end.getUTCFullYear() * 12 + end.getUTCMonth();
    while (year * 12 + month <= endIndex && keys.length < 36) {
        keys.push(`${year}-${String(month + 1).padStart(2, "0")}`);
        month += 1;
        if (month === 12) {
            month = 0;
            year += 1;
        }
    }
    return keys;
}

/**
 * Totals by tax kind plus a month-by-month series, summed in whole paise so
 * the figures are exact. Months are bucketed in the caller's own time zone.
 */
export function summariseTax(
    rows: TaxRow[],
    range: { from: Date; to: Date },
    tzOffsetMinutes = 0,
): TaxSummary {
    const keys = monthKeysBetween(range.from, range.to, tzOffsetMinutes);
    const monthPaise = new Map<string, Record<TaxKind, bigint>>(
        keys.map((key) => [key, { deductible: BigInt(0), tax_paid: BigInt(0), taxable_income: BigInt(0), tax_refund: BigInt(0) }]),
    );
    const totalPaise: Record<TaxKind, bigint> = { deductible: BigInt(0), tax_paid: BigInt(0), taxable_income: BigInt(0), tax_refund: BigInt(0) };
    const counts: Record<TaxKind, number> = { deductible: 0, tax_paid: 0, taxable_income: 0, tax_refund: 0 };

    for (const row of rows) {
        const paise = toPaise(row.amount);
        totalPaise[row.taxKind] += paise;
        counts[row.taxKind] += 1;
        const bucket = monthPaise.get(monthKey(row.date, tzOffsetMinutes));
        if (bucket) bucket[row.taxKind] += paise;
    }

    const rupees = (paise: bigint) => Number(paise) / 100;
    return {
        totals: {
            deductible: rupees(totalPaise.deductible),
            taxPaid: rupees(totalPaise.tax_paid),
            taxableIncome: rupees(totalPaise.taxable_income),
            taxRefund: rupees(totalPaise.tax_refund),
            netTaxPaid: rupees(totalPaise.tax_paid - totalPaise.tax_refund),
        },
        counts,
        months: keys.map((key) => {
            const bucket = monthPaise.get(key)!;
            return {
                key,
                deductible: rupees(bucket.deductible),
                taxPaid: rupees(bucket.tax_paid),
                taxableIncome: rupees(bucket.taxable_income),
                taxRefund: rupees(bucket.tax_refund),
            };
        }),
    };
}

