import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
    results: [] as unknown[],
    selectCalls: 0,
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_1" }) }));
vi.mock("@/lib/ledger", () => ({
    requireLedger: async () => ({ id: "ledger-1" }),
    ledgerErrorResponse: () => null,
}));
vi.mock("@/db", () => ({
    db: {
        select: () => {
            m.selectCalls++;
            const result = m.results.shift();
            const chain: Record<string, unknown> = {};
            for (const key of ["from", "leftJoin", "where", "orderBy", "limit", "offset"]) {
                chain[key] = () => chain;
            }
            chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
            return chain;
        },
    },
}));

import { GET } from "@/app/api/transactions/route";

const get = (query = "") =>
    GET(new NextRequest(`http://localhost/api/transactions${query}`));

const row = (n: number, title: string, description: string | null = null) => ({
    id: `t${n}`,
    title,
    amount: "10.00",
    type: "expense",
    currency: "INR",
    createdAt: new Date("2026-11-01"),
    category: { id: "c1", name: "Food", color: null },
    date: new Date("2026-11-01"),
    description,
});

describe("GET /api/transactions filters", () => {
    beforeEach(() => {
        m.results = [];
        m.selectCalls = 0;
    });

    it("rejects an invalid filter before touching the database", async () => {
        const res = await get("?type=bogus");
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ error: expect.any(String) });
        expect(m.selectCalls).toBe(0);
    });

    it("without text search: counts and pages in SQL", async () => {
        m.results = [[{ total: 25 }], [row(1, "Rent")]];
        const res = await get("?type=expense&_start=0&_end=10");
        expect(res.status).toBe(200);
        expect(res.headers.get("X-Total-Count")).toBe("25");
        expect(res.headers.get("X-Search-Truncated")).toBeNull();
        expect(m.selectCalls).toBe(2);
    });

    it("text search matches decrypted titles and descriptions, and hides the description", async () => {
        m.results = [[
            row(1, "Netflix"),
            row(2, "Rent", "paid via NETFLIX gift card"),
            row(3, "Groceries"),
        ]];
        const res = await get("?q=netflix");
        const body = await res.json();
        expect(res.headers.get("X-Total-Count")).toBe("2");
        expect(res.headers.get("X-Search-Truncated")).toBe("false");
        expect(body.map((r: { id: string }) => r.id)).toEqual(["t1", "t2"]);
        expect(body[0]).not.toHaveProperty("description");
        expect(m.selectCalls).toBe(1);
    });

    it("pages through the matches", async () => {
        m.results = [Array.from({ length: 5 }, (_, i) => row(i + 1, `Coffee ${i + 1}`))];
        const res = await get("?q=coffee&_start=2&_end=4");
        const body = await res.json();
        expect(res.headers.get("X-Total-Count")).toBe("5");
        expect(body.map((r: { id: string }) => r.id)).toEqual(["t3", "t4"]);
    });

    it("flags when the 5,000-row search window was exceeded", async () => {
        m.results = [Array.from({ length: 5001 }, (_, i) => row(i, "Coffee"))];
        const res = await get("?q=coffee");
        expect(res.headers.get("X-Search-Truncated")).toBe("true");
        expect(res.headers.get("X-Total-Count")).toBe("5000");
    });
});
