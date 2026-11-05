import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    selectImpl: vi.fn(),
    updateSet: vi.fn(),
    getOrCreatePersonalLedger: vi.fn(),
    createBusinessLedger: vi.fn(),
    redirect: vi.fn((to: string) => {
        throw new Error(`REDIRECT:${to}`);
    }),
    needsOnboarding: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/db", () => ({
    db: {
        select: () => ({ from: () => ({ where: () => ({ limit: () => m.selectImpl() }) }) }),
        update: () => ({
            set: (values: unknown) => {
                m.updateSet(values);
                return { where: async () => undefined };
            },
        }),
    },
}));
vi.mock("@/lib/ledger", () => ({
    getOrCreatePersonalLedger: m.getOrCreatePersonalLedger,
    createBusinessLedger: m.createBusinessLedger,
    ledgerErrorResponse: () => null,
}));

import { POST } from "@/app/api/onboarding/route";
import { needsOnboarding } from "@/lib/onboarding";

const post = (body: unknown) =>
    POST(
        new Request("http://localhost/api/onboarding", {
            method: "POST",
            body: typeof body === "string" ? body : JSON.stringify(body),
        }),
    );

const personal = { id: "p-1", type: "personal", name: "Personal" };
const business = { id: "b-1", type: "business", name: "Acme" };

describe("POST /api/onboarding", () => {
    beforeEach(() => {
        Object.values(m).forEach((fn) => "mockReset" in fn && fn.mockReset());
        m.redirect.mockImplementation((to: string) => {
            throw new Error(`REDIRECT:${to}`);
        });
        m.auth.mockResolvedValue({ userId: "user_1" });
        m.selectImpl.mockResolvedValue([{ id: "user_1" }]);
        m.getOrCreatePersonalLedger.mockResolvedValue(personal);
        m.createBusinessLedger.mockResolvedValue({ ledger: business, created: true });
    });

    it("rejects signed-out callers", async () => {
        m.auth.mockResolvedValue({ userId: null });
        expect((await post({ intent: "personal" })).status).toBe(401);
    });

    it("rejects bad input", async () => {
        expect((await post("not json")).status).toBe(400);
        expect((await post({ intent: "everything" })).status).toBe(400);
        expect((await post({ intent: "personal", extra: true })).status).toBe(400);
        expect((await post({ intent: "business" })).status).toBe(400);
        expect((await post({ intent: "both", businessName: "   " })).status).toBe(400);
        expect((await post({ intent: "both", businessName: "x".repeat(41) })).status).toBe(400);
        expect(m.createBusinessLedger).not.toHaveBeenCalled();
    });

    it("asks to retry while the account row does not exist yet", async () => {
        m.selectImpl.mockResolvedValue([]);
        const res = await post({ intent: "personal" });
        expect(res.status).toBe(409);
        expect(m.updateSet).not.toHaveBeenCalled();
    });

    it("personal: no business ledger, marks complete, starts in Personal", async () => {
        const res = await post({ intent: "personal" });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ completed: true, activeLedgerId: "p-1" });
        expect(m.createBusinessLedger).not.toHaveBeenCalled();
        expect(m.updateSet).toHaveBeenCalledWith(
            expect.objectContaining({ onboardingCompletedAt: expect.any(Date) }),
        );
    });

    it("both: creates the business ledger but starts in Personal", async () => {
        const res = await post({ intent: "both", businessName: "  Acme  " });
        expect(await res.json()).toEqual({ completed: true, activeLedgerId: "p-1" });
        expect(m.createBusinessLedger).toHaveBeenCalledWith("user_1", "Acme");
    });

    it("business: creates the business ledger and starts in it", async () => {
        const res = await post({ intent: "business", businessName: "Acme" });
        expect(await res.json()).toEqual({ completed: true, activeLedgerId: "b-1" });
    });

    it("is repeatable: an existing business ledger counts as success", async () => {
        m.createBusinessLedger.mockResolvedValue({ ledger: business, created: false });
        const res = await post({ intent: "business", businessName: "Acme" });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ activeLedgerId: "b-1" });
    });

    it("skip: touches no ledgers, only marks complete", async () => {
        const res = await post({ intent: "skip" });
        expect(await res.json()).toEqual({ completed: true, activeLedgerId: null });
        expect(m.getOrCreatePersonalLedger).not.toHaveBeenCalled();
        expect(m.createBusinessLedger).not.toHaveBeenCalled();
        expect(m.updateSet).toHaveBeenCalledTimes(1);
    });
});

describe("needsOnboarding", () => {
    // Braces matter: a hook that RETURNS a function is run as cleanup by Vitest.
    beforeEach(() => {
        m.selectImpl.mockReset();
    });

    it("is not pending when there is no users row yet", async () => {
        m.selectImpl.mockResolvedValue([]);
        expect(await needsOnboarding("u")).toBe(false);
    });
    it("is pending while onboarding_completed_at is NULL", async () => {
        m.selectImpl.mockResolvedValue([{ completedAt: null }]);
        expect(await needsOnboarding("u")).toBe(true);
    });
    it("is done once completed (this is every pre-existing user after 0014)", async () => {
        m.selectImpl.mockResolvedValue([{ completedAt: new Date() }]);
        expect(await needsOnboarding("u")).toBe(false);
    });
    it("fails open on a database error so nobody is locked out", async () => {
        m.selectImpl.mockRejectedValue(new Error("db down"));
        expect(await needsOnboarding("u")).toBe(false);
    });
});
