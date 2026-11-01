import { afterEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { PATCH as patchExpense } from "@/app/api/expenses/[id]/route";
import { PATCH as patchSubscription } from "@/app/api/subscriptions/[id]/route";
import { requireLedger } from "@/lib/ledger";

vi.mock("@clerk/nextjs/server", () => ({
    auth: vi.fn(),
}));

// The ledger lookup itself is covered in ledger.test.ts; here we only check
// that the route scopes its record lookup by the ledger it was given.
vi.mock("@/lib/ledger", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ledger")>()),
    requireLedger: vi.fn(),
}));

const LEDGER_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/db", () => ({
    db: {
        select: vi.fn(),
    },
}));

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

async function captureOwnerFilter(handler: typeof patchExpense | typeof patchSubscription, body: object) {
    const conditions: SQL[] = [];
    vi.mocked(auth).mockResolvedValue({ userId: "viewer-user" } as never);
    vi.mocked(requireLedger).mockResolvedValue({
        id: LEDGER_ID,
        ownerUserId: "viewer-user",
        type: "personal",
    } as never);
    vi.mocked(db.select).mockImplementation(
        () =>
            ({
                from: () => ({
                    where: (condition: SQL) => ({
                        limit: async () => {
                            conditions.push(condition);
                            return [];
                        },
                    }),
                }),
            }) as never,
    );

    const response = await handler(
        new Request("http://localhost/api/resource/00000000-0000-4000-8000-000000000001", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) },
    );

    expect(response.status).toBe(404);
    expect(conditions).toHaveLength(1);
    return new PgDialect().sqlToQuery(conditions[0]);
}

describe("record ownership checks", () => {
    it("limits expense lookups to the active ledger", async () => {
        const query = await captureOwnerFilter(patchExpense, {
            title: "Lunch",
            amount: "12.50",
            date: "2026-10-25",
            type: "expense",
            category: "Food",
            currency: "INR",
        });

        expect(query.sql).toContain("ledger_id");
        expect(query.params).toContain(LEDGER_ID);
        // Access is decided by requireLedger; the row filter must not depend on
        // the caller's user id, so shared ledgers (Phase 3) keep working.
        expect(query.params).not.toContain("viewer-user");
        expect(query.params).toContain("00000000-0000-4000-8000-000000000001");
    });

    it("limits subscription lookups to the active ledger", async () => {
        const query = await captureOwnerFilter(patchSubscription, {
            name: "Streaming",
            price: "12.50",
            currency: "INR",
            interval: "month",
            startDate: "2026-10-25",
            category: "Entertainment",
        });

        expect(query.sql).toContain("ledger_id");
        expect(query.params).toContain(LEDGER_ID);
        // Access is decided by requireLedger; the row filter must not depend on
        // the caller's user id, so shared ledgers (Phase 3) keep working.
        expect(query.params).not.toContain("viewer-user");
        expect(query.params).toContain("00000000-0000-4000-8000-000000000001");
    });
});
