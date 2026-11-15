import { describe, expect, it, vi } from "vitest";

// billingStatusFor is pure; keep the Neon pool out of the test.
vi.mock("@/db", () => ({ db: {} }));

import { billingStatusFor } from "@/lib/billing-state";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");
const PAST = new Date("2026-11-01T00:00:00.000Z");

describe("billingStatusFor", () => {
    it("is free with no subscription row", () => {
        expect(billingStatusFor(null, NOW)).toBe("free");
    });

    it("is paid while active and in period", () => {
        expect(
            billingStatusFor({ status: "active", currentPeriodEnd: FUTURE }, NOW),
        ).toBe("paid");
    });

    it("treats a trial like a paid period", () => {
        expect(
            billingStatusFor(
                { status: "trialing", currentPeriodEnd: FUTURE },
                NOW,
            ),
        ).toBe("paid");
    });

    it("is expired when the period has ended, even if the row says active", () => {
        expect(
            billingStatusFor({ status: "active", currentPeriodEnd: PAST }, NOW),
        ).toBe("expired");
    });

    it("is expired for statuses that never grant features", () => {
        for (const status of [
            "incomplete",
            "incomplete_expired",
            "past_due",
            "unpaid",
        ] as const) {
            expect(
                billingStatusFor({ status, currentPeriodEnd: FUTURE }, NOW),
            ).toBe("expired");
        }
    });

    it("is canceled even when the stored period ends in the future", () => {
        expect(
            billingStatusFor(
                { status: "canceled", currentPeriodEnd: FUTURE },
                NOW,
            ),
        ).toBe("canceled");
    });
});
