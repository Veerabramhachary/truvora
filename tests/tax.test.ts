import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TAX_KINDS as DB_TAX_KINDS } from "@/db/schema/tax";
import {
    allowedTaxKinds,
    currentTaxYearStart,
    summariseTax,
    TAX_KINDS,
    taxYearBounds,
    taxYearLabel,
    validateTaxKind,
    type TaxRow,
} from "@/lib/tax";

const d = (iso: string) => new Date(iso);

describe("tax kinds", () => {
    it("the client list matches the database enum", () => {
        expect([...TAX_KINDS]).toEqual([...DB_TAX_KINDS]);
    });

    it("expenses and subscriptions take deductible/paid; income takes taxable/refund", () => {
        expect(allowedTaxKinds("expense")).toEqual(["deductible", "tax_paid"]);
        expect(allowedTaxKinds("subscription")).toEqual(["deductible", "tax_paid"]);
        expect(allowedTaxKinds("income")).toEqual(["taxable_income", "tax_refund"]);
    });
});

describe("validateTaxKind", () => {
    it("accepts no tag anywhere", () => {
        expect(validateTaxKind({ ledgerType: "personal", recordType: "expense", taxKind: null })).toBeNull();
        expect(validateTaxKind({ ledgerType: "personal", recordType: "expense", taxKind: undefined })).toBeNull();
        expect(validateTaxKind({ ledgerType: "business", recordType: "income", taxKind: null })).toBeNull();
    });

    it("rejects any tag on a personal ledger", () => {
        expect(validateTaxKind({ ledgerType: "personal", recordType: "expense", taxKind: "deductible" }))
            .toBe("Tax tracking is only available for business ledgers");
    });

    it("accepts a matching tag on a business ledger", () => {
        expect(validateTaxKind({ ledgerType: "business", recordType: "expense", taxKind: "tax_paid" })).toBeNull();
        expect(validateTaxKind({ ledgerType: "business", recordType: "income", taxKind: "tax_refund" })).toBeNull();
        expect(validateTaxKind({ ledgerType: "business", recordType: "subscription", taxKind: "deductible" })).toBeNull();
    });

    it("rejects a tag that does not fit the record", () => {
        expect(validateTaxKind({ ledgerType: "business", recordType: "income", taxKind: "deductible" })).toMatch(/does not apply to income/);
        expect(validateTaxKind({ ledgerType: "business", recordType: "expense", taxKind: "taxable_income" })).toMatch(/does not apply to an expense/);
        expect(validateTaxKind({ ledgerType: "business", recordType: "subscription", taxKind: "tax_refund" })).toMatch(/does not apply to a subscription/);
    });
});

describe("tax year (April to March)", () => {
    it("31 March belongs to the year that started the April before", () => {
        expect(currentTaxYearStart(new Date(2026, 2, 31))).toBe(2025);
        expect(currentTaxYearStart(new Date(2026, 3, 1))).toBe(2026);
        expect(currentTaxYearStart(new Date(2026, 10, 2))).toBe(2026);
    });

    it("covers 1 April to 31 March in local time", () => {
        const { from, to } = taxYearBounds(2026);
        expect(from.getTime()).toBe(new Date(2026, 3, 1, 0, 0, 0, 0).getTime());
        expect(to.getTime()).toBe(new Date(2027, 2, 31, 23, 59, 59, 999).getTime());
    });

    it("labels the year", () => {
        expect(taxYearLabel(2026)).toBe("FY 2026–27");
        expect(taxYearLabel(2099)).toBe("FY 2099–00");
    });
});

describe("summariseTax", () => {
    // India: getTimezoneOffset() is -330. Tax year 2026-27 in IST.
    const IST = -330;
    const range = { from: d("2026-03-31T18:30:00.000Z"), to: d("2027-03-31T18:29:59.999Z") };
    const row = (date: string, amount: string, taxKind: TaxRow["taxKind"]): TaxRow => ({ date: d(date), amount, taxKind });

    it("builds twelve months, April to March, in the user's time zone", () => {
        const { months } = summariseTax([], range, IST);
        expect(months).toHaveLength(12);
        expect(months[0].key).toBe("2026-04");
        expect(months[11].key).toBe("2027-03");
    });

    it("adds money exactly (no floating point drift)", () => {
        const { totals } = summariseTax(
            [row("2026-05-01T00:00:00Z", "0.10", "deductible"), row("2026-05-02T00:00:00Z", "0.20", "deductible")],
            range,
            IST,
        );
        expect(totals.deductible).toBe(0.3);
    });

    it("totals each kind and nets tax paid against refunds", () => {
        const summary = summariseTax(
            [
                row("2026-06-10T00:00:00Z", "1000.00", "deductible"),
                row("2026-06-20T00:00:00Z", "2500.50", "tax_paid"),
                row("2026-07-05T00:00:00Z", "500.25", "tax_refund"),
                row("2026-07-06T00:00:00Z", "90000.00", "taxable_income"),
            ],
            range,
            IST,
        );
        expect(summary.totals).toEqual({
            deductible: 1000,
            taxPaid: 2500.5,
            taxableIncome: 90000,
            taxRefund: 500.25,
            netTaxPaid: 2000.25,
        });
        expect(summary.counts).toEqual({ deductible: 1, tax_paid: 1, taxable_income: 1, tax_refund: 1 });
    });

    it("puts a record in the month it falls in for the USER, not UTC", () => {
        const summary = summariseTax(
            [
                // 1 April 00:00 IST is still 31 March in UTC.
                row("2026-03-31T18:30:00.000Z", "100.00", "deductible"),
                // 30 April 23:59 IST is 18:29 UTC the same day.
                row("2026-04-30T18:29:59.000Z", "10.00", "deductible"),
                // 1 May 00:00 IST.
                row("2026-04-30T18:30:00.000Z", "1.00", "deductible"),
            ],
            range,
            IST,
        );
        const byKey = Object.fromEntries(summary.months.map((m) => [m.key, m.deductible]));
        expect(byKey["2026-04"]).toBe(110);
        expect(byKey["2026-05"]).toBe(1);
    });

    it("works with UTC and with zones behind UTC", () => {
        const utc = summariseTax([row("2026-04-01T00:00:00Z", "5.00", "tax_paid")], { from: d("2026-04-01T00:00:00Z"), to: d("2027-03-31T23:59:59.999Z") }, 0);
        expect(utc.months[0]).toMatchObject({ key: "2026-04", taxPaid: 5 });
        // New York (UTC-5 in this example): 1 April 02:00 UTC is still 31 March local.
        const ny = summariseTax(
            [row("2026-04-01T02:00:00Z", "5.00", "tax_paid")],
            { from: d("2026-03-01T05:00:00Z"), to: d("2026-04-30T03:59:59Z") },
            300,
        );
        expect(ny.months.find((m) => m.key === "2026-03")?.taxPaid).toBe(5);
    });
});

describe("renewal job keeps the tag", () => {
    it("copies the subscription's tax treatment onto each charge it records", () => {
        expect(readFileSync("lib/subscription-renewals.ts", "utf8")).toContain("taxKind: sub.taxKind");
    });
});
