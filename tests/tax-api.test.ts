import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
    ledger: { id: "ledger-1", type: "business" as "business" | "personal" },
    rows: [] as unknown[],
    inserts: [] as { table: string; values: Record<string, unknown> }[],
    transactionCalls: 0,
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_1" }) }));
vi.mock("@/lib/ledger", () => ({
    requireLedger: async () => m.ledger,
    ledgerErrorResponse: () => null,
}));
vi.mock("@/lib/category-access", () => ({
    resolveCategory: async () => ({ id: "cat-1", isCustom: false }),
}));
vi.mock("@/lib/feature-access", () => ({ canUseFeature: async () => true }));
vi.mock("@/db", () => {
    const select = () => {
        const chain: Record<string, unknown> = {};
        for (const key of ["from", "where", "orderBy", "limit", "innerJoin"]) chain[key] = () => chain;
        chain.then = (resolve: (value: unknown) => unknown) => resolve(m.rows);
        return chain;
    };
    const tx = {
        insert: (table: { __name?: string }) => ({
            values: (values: Record<string, unknown>) => {
                m.inserts.push({ table: String(table?.__name ?? "?"), values });
                return { returning: async () => [{ id: "expense-1" }] };
            },
        }),
    };
    return {
        db: {
            select,
            transaction: async (fn: (t: unknown) => Promise<unknown>) => {
                m.transactionCalls++;
                return fn(tx);
            },
        },
    };
});

import { GET as summary } from "@/app/api/tax/summary/route";
import { POST as createExpense } from "@/app/api/expenses/route";

const FROM = "2026-03-31T18:30:00.000Z";
const TO = "2027-03-31T18:29:59.999Z";
const get = (query: string) => summary(new NextRequest(`http://localhost/api/tax/summary${query}`));

describe("GET /api/tax/summary", () => {
    beforeEach(() => {
        m.ledger = { id: "ledger-1", type: "business" };
        m.rows = [];
    });

    it("is for business ledgers only", async () => {
        m.ledger = { id: "ledger-1", type: "personal" };
        const res = await get(`?from=${FROM}&to=${TO}`);
        expect(res.status).toBe(403);
    });

    it("validates the range", async () => {
        expect((await get("")).status).toBe(400);
        expect((await get(`?from=${TO}&to=${FROM}`)).status).toBe(400);
        expect((await get(`?from=2024-01-01&to=2026-01-01`)).status).toBe(400);
        expect((await get(`?from=${FROM}&to=${TO}&tzOffset=99999`)).status).toBe(400);
        expect((await get(`?from=${FROM}&to=${TO}&currency=rupees`)).status).toBe(400);
    });

    it("returns totals and months from the tagged transactions", async () => {
        m.rows = [
            { date: new Date("2026-06-10T00:00:00Z"), amount: "1000.00", taxKind: "deductible" },
            { date: new Date("2026-06-11T00:00:00Z"), amount: "250.50", taxKind: "tax_paid" },
        ];
        const res = await get(`?from=${FROM}&to=${TO}&tzOffset=-330`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.currency).toBe("INR");
        expect(body.truncated).toBe(false);
        expect(body.totals).toMatchObject({ deductible: 1000, taxPaid: 250.5, netTaxPaid: 250.5 });
        expect(body.months).toHaveLength(12);
    });

    it("flags a truncated result", async () => {
        m.rows = Array.from({ length: 20_001 }, () => ({
            date: new Date("2026-06-10T00:00:00Z"),
            amount: "1.00",
            taxKind: "deductible",
        }));
        const body = await (await get(`?from=${FROM}&to=${TO}`)).json();
        expect(body.truncated).toBe(true);
        expect(body.counts.deductible).toBe(20_000);
    });
});

describe("POST /api/expenses tax tag", () => {
    const post = (extra: Record<string, unknown>) =>
        createExpense(
            new Request("http://localhost/api/expenses", {
                method: "POST",
                body: JSON.stringify({
                    title: "Office rent",
                    amount: "100.00",
                    date: "2026-11-01",
                    type: "expense",
                    category: "Rent",
                    currency: "INR",
                    ...extra,
                }),
            }),
        );

    beforeEach(() => {
        m.ledger = { id: "ledger-1", type: "business" };
        m.inserts = [];
        m.transactionCalls = 0;
    });

    it("rejects a tax tag on a personal ledger without writing anything", async () => {
        m.ledger = { id: "ledger-1", type: "personal" };
        const res = await post({ taxKind: "deductible" });
        expect(res.status).toBe(400);
        expect(m.transactionCalls).toBe(0);
    });

    it("rejects a tag that does not fit (taxable income on an expense)", async () => {
        const res = await post({ taxKind: "taxable_income" });
        expect(res.status).toBe(400);
        expect(m.transactionCalls).toBe(0);
    });

    it("saves the tag on the expense AND its ledger transaction", async () => {
        const res = await post({ taxKind: "deductible" });
        expect(res.status).toBe(200);
        expect(m.inserts).toHaveLength(2);
        expect(m.inserts.map((i) => i.values.taxKind)).toEqual(["deductible", "deductible"]);
    });

    it("stores no tag when none is given", async () => {
        const res = await post({});
        expect(res.status).toBe(200);
        expect(m.inserts.map((i) => i.values.taxKind)).toEqual([null, null]);
    });
});
