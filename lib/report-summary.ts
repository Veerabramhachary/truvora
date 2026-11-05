import { toPaise } from "@/lib/money";
import type { TaxKind } from "@/lib/tax";

/**
 * Totals shown at the top of the Pro ("advanced") PDF export. Everything is
 * computed from the very rows being exported, in whole paise, so the summary
 * can never disagree with the table below it.
 */

export type ReportRecord = {
    type: "income" | "expense" | "subscription";
    amount: string;
    currency: string;
    category: string | null;
    taxKind?: TaxKind | null;
};

export type CurrencyTotals = {
    currency: string;
    income: bigint;
    expenses: bigint;
    subscriptions: bigint;
    /** income - expenses - subscriptions */
    net: bigint;
};

export type CategoryShare = {
    currency: string;
    name: string;
    amount: bigint;
    /** Share of that currency's spending, 0-100, one decimal. */
    percent: number;
};

export type TaxTotals = {
    currency: string;
    deductible: bigint;
    taxableIncome: bigint;
    taxPaid: bigint;
    taxRefund: bigint;
    /** tax paid - refunds received */
    netTaxPaid: bigint;
    records: number;
};

export type ReportSummary = {
    totals: CurrencyTotals[];
    categories: CategoryShare[];
    tax: TaxTotals[];
};

const ZERO = BigInt(0);

export function summariseRecords(
    records: ReportRecord[],
    options: { includeTax: boolean; maxCategories?: number } = { includeTax: false },
): ReportSummary {
    const maxCategories = options.maxCategories ?? 8;
    const totals = new Map<string, CurrencyTotals>();
    const spend = new Map<string, Map<string, bigint>>();
    const tax = new Map<string, TaxTotals>();

    for (const record of records) {
        const paise = toPaise(record.amount);
        const currency = record.currency;

        const t =
            totals.get(currency) ??
            { currency, income: ZERO, expenses: ZERO, subscriptions: ZERO, net: ZERO };
        if (record.type === "income") t.income += paise;
        else if (record.type === "expense") t.expenses += paise;
        else t.subscriptions += paise;
        totals.set(currency, t);

        if (record.type !== "income") {
            const byCategory = spend.get(currency) ?? new Map<string, bigint>();
            const name = record.category?.trim() || "Uncategorised";
            byCategory.set(name, (byCategory.get(name) ?? ZERO) + paise);
            spend.set(currency, byCategory);
        }

        if (options.includeTax && record.taxKind) {
            const x =
                tax.get(currency) ??
                {
                    currency,
                    deductible: ZERO,
                    taxableIncome: ZERO,
                    taxPaid: ZERO,
                    taxRefund: ZERO,
                    netTaxPaid: ZERO,
                    records: 0,
                };
            if (record.taxKind === "deductible") x.deductible += paise;
            else if (record.taxKind === "taxable_income") x.taxableIncome += paise;
            else if (record.taxKind === "tax_paid") x.taxPaid += paise;
            else x.taxRefund += paise;
            x.records += 1;
            tax.set(currency, x);
        }
    }

    for (const t of totals.values()) t.net = t.income - t.expenses - t.subscriptions;
    for (const x of tax.values()) x.netTaxPaid = x.taxPaid - x.taxRefund;

    const categories: CategoryShare[] = [];
    for (const [currency, byCategory] of spend) {
        const sorted = [...byCategory.entries()].sort(
            (a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : a[0].localeCompare(b[0])),
        );
        const total = sorted.reduce((sum, [, amount]) => sum + amount, ZERO);
        const top = sorted.slice(0, maxCategories);
        const rest = sorted.slice(maxCategories).reduce((sum, [, amount]) => sum + amount, ZERO);
        const rows = rest > ZERO ? [...top, ["Other", rest] as [string, bigint]] : top;
        for (const [name, amount] of rows) {
            // Tenths of a percent, using whole numbers so nothing drifts.
            const percent = total > ZERO ? Number((amount * BigInt(1000)) / total) / 10 : 0;
            categories.push({ currency, name, amount, percent });
        }
    }

    const byCurrency = (a: { currency: string }, b: { currency: string }) =>
        a.currency.localeCompare(b.currency);
    return {
        totals: [...totals.values()].sort(byCurrency),
        categories,
        tax: [...tax.values()].sort(byCurrency),
    };
}

/**
 * `INR 12,34,567.89`. The PDF fonts cannot draw the rupee sign, so amounts use
 * the currency code. INR is grouped the Indian way (lakh, crore), others in
 * threes.
 */
export function formatMoney(paise: bigint, currency: string): string {
    const negative = paise < ZERO;
    const absolute = negative ? -paise : paise;
    const whole = (absolute / BigInt(100)).toString();
    const fraction = (absolute % BigInt(100)).toString().padStart(2, "0");

    let grouped: string;
    if (currency === "INR" && whole.length > 3) {
        const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
        grouped = `${head},${whole.slice(-3)}`;
    } else {
        grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    return `${negative ? "-" : ""}${currency} ${grouped}.${fraction}`;
}
