import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
    LedgerError,
    ledgerErrorResponse,
    requireLedger,
} from "@/lib/ledger";

vi.mock("@/db", () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
    },
}));

const OWN_ID = "11111111-1111-4111-8111-111111111111";
const ledger = { id: OWN_ID, ownerUserId: "user-a", type: "personal", name: "Personal", archivedAt: null };

/** Each call to db.select() resolves to the next entry of `results`. */
function mockSelectResults(...results: unknown[][]) {
    const queue = [...results];
    vi.mocked(db.select).mockImplementation(
        () =>
            ({
                from: () => ({
                    where: () => ({
                        limit: async () => queue.shift() ?? [],
                    }),
                }),
            }) as never,
    );
}

function mockInsert(impl: () => Promise<unknown>) {
    vi.mocked(db.insert).mockImplementation(
        () => ({ values: () => ({ onConflictDoNothing: impl }) }) as never,
    );
}

const request = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/expenses", { headers });

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("requireLedger", () => {
    it("uses the personal ledger when no header is sent", async () => {
        mockSelectResults([ledger]);
        await expect(requireLedger(request(), "user-a")).resolves.toEqual(ledger);
        expect(db.insert).not.toHaveBeenCalled();
    });

    it("creates the personal ledger on first use", async () => {
        mockSelectResults([], [ledger]); // not found, then found after insert
        mockInsert(async () => undefined);
        await expect(requireLedger(request(), "user-a")).resolves.toEqual(ledger);
        expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it("answers 409 when the user row does not exist yet", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        mockSelectResults([], []);
        mockInsert(async () => {
            throw new Error("foreign key violation");
        });
        const error = await requireLedger(request(), "ghost").catch((e) => e);
        expect(error).toBeInstanceOf(LedgerError);
        expect(error.status).toBe(409);
    });

    it("rejects a malformed ledger id with 400", async () => {
        const error = await requireLedger(request({ "x-ledger-id": "not-a-uuid" }), "user-a").catch((e) => e);
        expect(error).toBeInstanceOf(LedgerError);
        expect(error.status).toBe(400);
        expect(db.select).not.toHaveBeenCalled();
    });

    it("returns 404 for a ledger the caller does not own or that is missing", async () => {
        mockSelectResults([]); // the query filters by owner, so a foreign ledger finds nothing
        const error = await requireLedger(request({ "x-ledger-id": OWN_ID }), "user-b").catch((e) => e);
        expect(error).toBeInstanceOf(LedgerError);
        expect(error.status).toBe(404);
    });

    it("returns an owned ledger selected by header", async () => {
        const business = { ...ledger, type: "business", name: "Shop" };
        mockSelectResults([business]);
        await expect(requireLedger(request({ "x-ledger-id": OWN_ID }), "user-a")).resolves.toEqual(business);
    });
});

describe("ledgerErrorResponse", () => {
    it("maps LedgerError to its status and ignores other errors", async () => {
        const response = ledgerErrorResponse(new LedgerError("Ledger not found", 404));
        expect(response?.status).toBe(404);
        expect(await response?.json()).toEqual({ error: "Ledger not found" });
        expect(ledgerErrorResponse(new Error("boom"))).toBeNull();
    });
});
