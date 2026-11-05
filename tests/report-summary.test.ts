import { describe, expect, it } from "vitest";
import {
    formatMoney,
    summariseRecords,
    type ReportRecord,
} from "@/lib/report-summary";

const rec = (over: Partial<ReportRecord> & Pick<ReportRecord, "type" | "amount">): ReportRecord => ({
    currency: "INR",
    category: null,
    taxKind: null,
    ...over,
});

describe("formatMoney", () => {
    it("groups INR the Indian way (lakh, crore)", () => {
        expect(formatMoney(BigInt(123456789), "INR")).toBe("INR 12,34,567.89");
        expect(formatMoney(BigInt(100000), "INR")).toBe("INR 1,000.00");
        expect(formatMoney(BigInt(10000000), "INR")).toBe("INR 1,00,000.00");
        expect(formatMoney(BigInt(99900), "INR")).toBe("INR 999.00");
    });

    it("groups other currencies in threes", () => {
        expect(formatMoney(BigInt(123456789), "USD")).toBe("USD 1,234,567.89");
    });

    it("keeps pennies and signs", () => {
        expect(formatMoney(BigInt(5), "INR")).toBe("INR 0.05");
        expect(formatMoney(BigInt(-500), "INR")).toBe("-INR 5.00");
        expect(formatMoney(BigInt(0), "INR")).toBe("INR 0.00");
    });
});

describe("summariseRecords", () => {
    it("totals income, expenses and subscriptions exactly and nets them", () => {
        const { totals } = summariseRecords([
            rec({ type: "income", amount: "1000.10" }),
            rec({ type: "income", amount: "0.20" }),
            rec({ type: "expense", amount: "250.50" }),
            rec({ type: "subscription", amount: "99.00" }),
        ]);
        expect(totals).toHaveLength(1);
        const t = totals[0];
        expect(formatMoney(t.income, "INR")).toBe("INR 1,000.30");
        expect(formatMoney(t.expenses, "INR")).toBe("INR 250.50");
        expect(formatMoney(t.subscriptions, "INR")).toBe("INR 99.00");
        expect(formatMoney(t.net, "INR")).toBe("INR 650.80");
    });

    it("keeps currencies apart", () => {
        const { totals } = summariseRecords([
            rec({ type: "expense", amount: "10.00", currency: "INR" }),
            rec({ type: "expense", amount: "5.00", currency: "USD" }),
        ]);
        expect(totals.map((t) => t.currency)).toEqual(["INR", "USD"]);
    });

    it("shares spending by category, biggest first, income excluded", () => {
        const { categories } = summariseRecords([
            rec({ type: "expense", amount: "250.50", category: "Food" }),
            rec({ type: "subscription", amount: "99.00", category: "Software" }),
            rec({ type: "income", amount: "5000.00", category: "Sales" }),
        ]);
        expect(categories.map((c) => c.name)).toEqual(["Food", "Software"]);
        expect(categories[0].percent).toBe(71.6);
        expect(categories[1].percent).toBe(28.3);
    });

    it("rolls the long tail into Other", () => {
        const records = ["A", "B", "C", "D", "E"].map((name, i) =>
            rec({ type: "expense", amount: `${(5 - i) * 10}.00`, category: name }),
        );
        const { categories } = summariseRecords(records, { includeTax: false, maxCategories: 3 });
        expect(categories.map((c) => c.name)).toEqual(["A", "B", "C", "Other"]);
        expect(formatMoney(categories[3].amount, "INR")).toBe("INR 30.00"); // D + E
    });

    it("labels missing categories", () => {
        const { categories } = summariseRecords([rec({ type: "expense", amount: "1.00", category: null })]);
        expect(categories[0].name).toBe("Uncategorised");
    });

    it("sums tax kinds and nets paid against refunds, only when asked", () => {
        const records = [
            rec({ type: "expense", amount: "1000.00", taxKind: "deductible" }),
            rec({ type: "expense", amount: "2500.50", taxKind: "tax_paid" }),
            rec({ type: "income", amount: "500.25", taxKind: "tax_refund" }),
            rec({ type: "income", amount: "90000.00", taxKind: "taxable_income" }),
            rec({ type: "expense", amount: "7.00" }), // untagged
        ];
        const { tax } = summariseRecords(records, { includeTax: true });
        expect(tax).toHaveLength(1);
        expect(formatMoney(tax[0].deductible, "INR")).toBe("INR 1,000.00");
        expect(formatMoney(tax[0].taxPaid, "INR")).toBe("INR 2,500.50");
        expect(formatMoney(tax[0].taxRefund, "INR")).toBe("INR 500.25");
        expect(formatMoney(tax[0].taxableIncome, "INR")).toBe("INR 90,000.00");
        expect(formatMoney(tax[0].netTaxPaid, "INR")).toBe("INR 2,000.25");
        expect(tax[0].records).toBe(4);

        expect(summariseRecords(records, { includeTax: false }).tax).toEqual([]);
    });
});
