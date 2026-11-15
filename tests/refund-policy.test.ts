import { describe, expect, it } from "vitest";
import {
    MAX_PAYMENT_AGE_DAYS,
    MIN_REFUND_PAISE,
    REFUND_COOLDOWN_DAYS,
    calculateRefund,
} from "@/lib/refund-policy";

const DAY = 24 * 60 * 60 * 1000;
const paidAt = new Date("2026-11-01T00:00:00.000Z");

function refund(overrides: Partial<Parameters<typeof calculateRefund>[0]> = {}) {
    return calculateRefund({
        amountPaid: "1000.00",
        amountRefunded: "0.00",
        paidAt,
        periodStart: new Date("2026-11-01T00:00:00.000Z"),
        periodEnd: new Date("2026-12-01T00:00:00.000Z"),
        now: new Date("2026-11-03T00:00:00.000Z"),
        ...overrides,
    });
}

describe("calculateRefund", () => {
    it("refunds in full inside the 7-day window", () => {
        const result = refund({ now: new Date(paidAt.getTime() + 7 * DAY) });

        expect(result).toMatchObject({
            eligible: true,
            kind: "full_window",
            daysSincePayment: 7,
            reason: null,
        });
        expect(result.amountPaise).toBe(BigInt(100000));
    });

    it("prorates unused whole days after the window", () => {
        // 15.5 days left rounds down to 15 of 30.
        const result = refund({ now: new Date("2026-11-15T12:00:00.000Z") });

        expect(result).toMatchObject({
            eligible: true,
            kind: "prorated",
            unusedDays: 15,
            totalDays: 30,
        });
        expect(result.amountPaise).toBe(BigInt(50000));
    });

    it("prorates a yearly period without floating point drift", () => {
        const result = refund({
            amountPaid: "2999.00",
            paidAt: new Date("2026-01-01T00:00:00.000Z"),
            periodStart: new Date("2026-01-01T00:00:00.000Z"),
            periodEnd: new Date("2027-01-01T00:00:00.000Z"),
            now: new Date("2026-06-15T00:00:00.000Z"),
        });

        expect(result).toMatchObject({ unusedDays: 200, totalDays: 365 });
        expect(result.amountPaise).toBe(BigInt(164328));
    });

    it("refunds only what is left after a partial refund", () => {
        const result = refund({ amountRefunded: "400.00" });

        expect(result.amountPaise).toBe(BigInt(60000));
    });

    it("rejects an amount below ₹10", () => {
        // 2 unused days of 30 on ₹100 is ₹6.67.
        const result = refund({
            amountPaid: "100.00",
            now: new Date("2026-11-29T00:00:00.000Z"),
        });

        expect(result).toMatchObject({
            eligible: false,
            reason: "below_minimum",
            kind: "prorated",
        });
        expect(result.amountPaise).toBeLessThan(MIN_REFUND_PAISE);
    });

    it("refuses once the period has ended", () => {
        const result = refund({ now: new Date("2026-12-01T00:00:00.000Z") });

        expect(result).toMatchObject({
            eligible: false,
            reason: "period_ended",
        });
        expect(result.amountPaise).toBe(BigInt(0));
    });

    it("refuses payments outside Razorpay's refund window", () => {
        const result = refund({
            paidAt: new Date(
                new Date("2026-11-01T00:00:00.000Z").getTime() -
                    (MAX_PAYMENT_AGE_DAYS + 1) * DAY,
            ),
            periodEnd: new Date("2027-11-01T00:00:00.000Z"),
        });

        expect(result).toMatchObject({
            eligible: false,
            reason: "payment_too_old",
        });
    });

    it("allows one refund per cooldown window", () => {
        const result = refund({
            lastRefundAt: new Date(
                new Date("2026-11-03T00:00:00.000Z").getTime() -
                    (REFUND_COOLDOWN_DAYS - 1) * DAY,
            ),
        });

        expect(result).toMatchObject({ eligible: false, reason: "cooldown" });
    });

    it("refuses when the payment is fully refunded", () => {
        const result = refund({ amountRefunded: "1000.00" });

        expect(result).toMatchObject({
            eligible: false,
            reason: "nothing_left",
        });
    });

    it("refuses when the billing period is unknown", () => {
        const result = refund({ periodEnd: null });

        expect(result).toMatchObject({
            eligible: false,
            reason: "missing_period",
        });
    });
});
