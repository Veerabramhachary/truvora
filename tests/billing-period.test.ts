import { describe, expect, it } from "vitest";
import { addBillingInterval } from "@/lib/billing-period";

function utcDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
}

describe("addBillingInterval", () => {
    it("adds monthly periods without rolling over short months", () => {
        expect(
            addBillingInterval(utcDate("2026-01-31"), "month", 1).toISOString(),
        ).toBe("2026-02-28T00:00:00.000Z");

        expect(
            addBillingInterval(utcDate("2028-01-31"), "month", 1).toISOString(),
        ).toBe("2028-02-29T00:00:00.000Z");
    });

    it("adds multiple months and years", () => {
        expect(
            addBillingInterval(utcDate("2026-11-06"), "month", 3).toISOString(),
        ).toBe("2027-02-06T00:00:00.000Z");

        expect(
            addBillingInterval(utcDate("2028-02-29"), "year", 1).toISOString(),
        ).toBe("2029-02-28T00:00:00.000Z");
    });

    it("keeps the original time of day", () => {
        expect(
            addBillingInterval(
                new Date("2026-11-06T18:30:45.123Z"),
                "month",
                1,
            ).toISOString(),
        ).toBe("2026-12-06T18:30:45.123Z");
    });

    it("rejects invalid interval counts", () => {
        expect(() => addBillingInterval(utcDate("2026-01-01"), "month", 0)).toThrow();
        expect(() => addBillingInterval(utcDate("2026-01-01"), "month", 1.5)).toThrow();
    });
});
