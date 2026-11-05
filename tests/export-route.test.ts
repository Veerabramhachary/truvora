import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
    ledger: { id: "ledger-1", name: "Acme", type: "business" as "business" | "personal" },
    formats: null as unknown,
    consume: true,
    rows: [] as unknown[][],
    selectCalls: 0,
    pdfInput: null as null | Record<string, unknown>,
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_1" }) }));
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimits: async () => ({ ok: true }),
    rateLimitResponse: () => null,
}));
vi.mock("@/lib/ledger", () => ({
    requireLedger: async () => m.ledger,
    ledgerErrorResponse: () => null,
}));
vi.mock("@/lib/feature-access", () => ({
    getFeatureLimit: async () => m.formats,
    tryConsumeFeature: async () => m.consume,
}));
vi.mock("@/lib/pdf-report", () => ({
    buildReportPdf: async (input: Record<string, unknown>) => {
        m.pdfInput = input;
        return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
    },
}));
vi.mock("@/db", () => ({
    db: {
        select: () => {
            m.selectCalls++;
            const result = m.rows.shift() ?? [];
            const chain: Record<string, unknown> = {};
            for (const key of ["from", "leftJoin", "where", "orderBy", "limit"]) chain[key] = () => chain;
            chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
            return chain;
        },
    },
}));

import { GET } from "@/app/api/export/route";

const get = (query: string) => GET(new Request(`http://localhost/api/export${query}`));

const row = (over: Record<string, unknown> = {}) => ({
    title: "Coffee",
    type: "expense",
    action: "created",
    amount: "120.00",
    currency: "INR",
    date: new Date("2026-10-31T18:30:00.000Z"),
    createdAt: new Date("2026-11-01T05:00:00.000Z"),
    taxKind: null,
    description: null,
    categoryName: "Food",
    ...over,
});

const PDF_PLAN = (pdfLevel: "basic" | "advanced") => ({ csv: true, pdf: true, pdfLevel, xlsx: false });

describe("GET /api/export", () => {
    beforeEach(() => {
        m.ledger = { id: "ledger-1", name: "Acme", type: "business" };
        m.formats = PDF_PLAN("basic");
        m.consume = true;
        m.rows = [];
        m.selectCalls = 0;
        m.pdfInput = null;
    });

    it("rejects an unknown type, format or filter before reading anything", async () => {
        expect((await get("?type=bogus")).status).toBe(400);
        expect((await get("?type=transactions&format=xlsx")).status).toBe(400);
        expect((await get("?type=transactions&minAmount=abc")).status).toBe(400);
        expect(m.selectCalls).toBe(0);
    });

    describe("CSV (default)", () => {
        it("is unchanged: BOM, header row, UTC dates, no plan-format lookup", async () => {
            m.rows = [[row()]];
            const res = await get("?type=transactions");
            expect(res.status).toBe(200);
            expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
            expect(res.headers.get("Content-Disposition")).toMatch(/\.csv"$/);
            const bytes = new Uint8Array(await res.arrayBuffer());
            expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
            const body = new TextDecoder().decode(bytes.slice(3));
            expect(body).toContain('"Date","Description","Category","Type","Action","Amount","Currency","Recorded"');
            // No tzOffset sent: dates stay UTC dates, as before.
            expect(body).toContain('"2026-10-31","Coffee","Food","expense","created","120.00","INR","2026-11-01"');
            expect(m.pdfInput).toBeNull();
        });

        it("uses the caller's calendar when a time-zone offset is sent", async () => {
            m.rows = [[row()]];
            const body = await (await get("?type=transactions&tzOffset=-330")).text();
            expect(body).toContain('"2026-11-01","Coffee"');
        });

        it("keeps spreadsheet-formula protection", async () => {
            m.rows = [[row({ title: "=HYPERLINK(\"x\")" })]];
            const body = await (await get("?type=transactions")).text();
            expect(body).toContain("\"'=HYPERLINK");
        });

        it("still honours the export quota", async () => {
            m.rows = [[row()]];
            m.consume = false;
            const res = await get("?type=transactions");
            expect(res.status).toBe(403);
            expect(await res.json()).toMatchObject({ error: expect.stringMatching(/limit/i) });
        });

        it("applies the list filters to the export", async () => {
            m.rows = [[row({ title: "Netflix" }), row({ title: "Rent", description: "paid with NETFLIX card" }), row({ title: "Food" })]];
            const body = await (await get("?type=transactions&q=netflix")).text();
            expect(body).toContain('"Netflix"');
            expect(body).toContain('"Rent"');
            expect(body).not.toContain('"Food","Food"');
        });
    });

    describe("PDF", () => {
        it("is refused on a plan without PDF, before any data is read", async () => {
            m.formats = { csv: true, pdf: false, pdfLevel: "none", xlsx: false };
            const res = await get("?type=transactions&format=pdf");
            expect(res.status).toBe(403);
            expect(await res.json()).toMatchObject({ error: expect.stringMatching(/PDF/) });
            expect(m.selectCalls).toBe(0);
            expect(m.pdfInput).toBeNull();
        });

        it("is refused when the user has no active plan", async () => {
            m.formats = null;
            expect((await get("?type=transactions&format=pdf")).status).toBe(403);
        });

        it("basic plan: plain table, no summary, no tax column", async () => {
            m.rows = [[row({ taxKind: "deductible" })]];
            const res = await get("?type=transactions&format=pdf");
            expect(res.status).toBe(200);
            expect(res.headers.get("Content-Type")).toBe("application/pdf");
            expect(res.headers.get("Content-Disposition")).toMatch(/truvora-business-transactions-\d{4}-\d{2}-\d{2}\.pdf"$/);
            expect(m.pdfInput).toMatchObject({ level: "basic", title: "Transactions", ledgerName: "Acme", ledgerType: "business" });
            expect(m.pdfInput!.summary).toBeUndefined();
            expect((m.pdfInput!.columns as { header: string }[]).map((c) => c.header)).not.toContain("Tax");
        });

        it("advanced plan, business ledger: summary and a tax column", async () => {
            m.formats = PDF_PLAN("advanced");
            m.rows = [[row({ taxKind: "deductible" }), row({ type: "income", amount: "1000.00", taxKind: "taxable_income" })]];
            await get("?type=transactions&format=pdf");
            expect(m.pdfInput).toMatchObject({ level: "advanced" });
            expect(m.pdfInput!.summary).toBeDefined();
            const headers = (m.pdfInput!.columns as { header: string }[]).map((c) => c.header);
            expect(headers).toContain("Tax");
            const rows = m.pdfInput!.rows as string[][];
            expect(rows[0].at(-1)).toBe("Tax-deductible");
        });

        it("advanced plan, personal ledger: no tax column", async () => {
            m.formats = PDF_PLAN("advanced");
            m.ledger = { id: "ledger-1", name: "Me", type: "personal" };
            m.rows = [[row()]];
            await get("?type=transactions&format=pdf");
            const headers = (m.pdfInput!.columns as { header: string }[]).map((c) => c.header);
            expect(headers).not.toContain("Tax");
        });

        it("formats amounts with the currency code and dates in the caller's calendar", async () => {
            m.rows = [[row({ amount: "1234567.89" })]];
            await get("?type=transactions&format=pdf&tzOffset=-330");
            const rows = m.pdfInput!.rows as string[][];
            expect(rows[0][0]).toBe("2026-11-01");
            expect(rows[0][4]).toBe("INR 12,34,567.89");
        });

        it("describes the active filters on the first page, and a type filter does not clobber the source", async () => {
            m.rows = [[row()]];
            // `type` is the export source; the record-type filter is `recordType`.
            const res = await get(
                "?type=transactions&format=pdf&recordType=expense&currency=inr&minAmount=10&maxAmount=500",
            );
            expect(res.status).toBe(200);
            expect(m.pdfInput!.title).toBe("Transactions");
            const lines = (m.pdfInput!.filterLines as string[]).join(" | ");
            expect(lines).toMatch(/Type: Expense/);
            expect(lines).toMatch(/Currency: INR/);
            expect(lines).toMatch(/Amount: 10 to 500/);
        });

        it("rejects a record type the list cannot contain", async () => {
            expect((await get("?type=expenses&format=pdf&recordType=subscription")).status).toBe(400);
        });

        it("says so when the PDF is capped", async () => {
            m.rows = [Array.from({ length: 2001 }, () => row()), [{ total: 5310 }]];
            await get("?type=transactions&format=pdf");
            expect((m.pdfInput!.rows as unknown[]).length).toBe(2000);
            expect(m.pdfInput!.truncatedNote).toMatch(/2,000 of 5,310/);
        });

        it("subscriptions export has no summary or filters", async () => {
            m.formats = PDF_PLAN("advanced");
            m.rows = [[{ title: "Netflix", price: "649.00", currency: "INR", interval: "month", startDate: new Date(), nextDate: new Date("2026-12-01"), active: true, categoryName: "Entertainment" }]];
            const res = await get("?type=subscriptions&format=pdf");
            expect(res.status).toBe(200);
            expect(m.pdfInput!.summary).toBeUndefined();
            expect(m.pdfInput!.title).toBe("Subscriptions");
        });

        it("still honours the export quota", async () => {
            m.rows = [[row()]];
            m.consume = false;
            expect((await get("?type=transactions&format=pdf")).status).toBe(403);
        });
    });
});
