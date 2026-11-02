import { describe, expect, it } from "vitest";
import {
    isChargeableOn,
    MAX_CYCLES_PER_RUN,
    nextCycleDate,
    planRenewals,
    type RenewalSubscription,
} from "@/lib/subscription-cycles";

const d = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString();

const monthly = (over: Partial<RenewalSubscription> = {}): RenewalSubscription => ({
    active: true,
    startDate: d("2026-01-15T10:00:00.000Z"),
    endDate: d("9999-12-31T00:00:00.000Z"),
    deactivatedAt: null,
    nextDate: d("2026-02-15T10:00:00.000Z"),
    interval: "month",
    intervalCount: 1,
    ...over,
});

describe("nextCycleDate", () => {
    it("adds one month and keeps the time of day", () => {
        expect(iso(nextCycleDate(d("2026-01-15T10:00:00Z"), d("2026-02-15T10:00:00Z"), "month", 1)))
            .toBe("2026-03-15T10:00:00.000Z");
    });

    it("anchors on the start day: Jan 31 -> Feb 28 -> Mar 31 (no drift)", () => {
        const start = d("2026-01-31T00:00:00Z");
        const feb = nextCycleDate(start, start, "month", 1);
        expect(iso(feb)).toBe("2026-02-28T00:00:00.000Z");
        expect(iso(nextCycleDate(start, feb, "month", 1))).toBe("2026-03-31T00:00:00.000Z");
    });

    it("handles leap years", () => {
        const start = d("2028-01-31T00:00:00Z");
        expect(iso(nextCycleDate(start, start, "month", 1))).toBe("2028-02-29T00:00:00.000Z");
    });

    it("steps intervalCount months", () => {
        expect(iso(nextCycleDate(d("2026-01-10T00:00:00Z"), d("2026-01-10T00:00:00Z"), "month", 3)))
            .toBe("2026-04-10T00:00:00.000Z");
    });

    it("steps years, including Feb 29 -> Feb 28", () => {
        const start = d("2028-02-29T00:00:00Z");
        expect(iso(nextCycleDate(start, start, "year", 1))).toBe("2029-02-28T00:00:00.000Z");
        expect(iso(nextCycleDate(start, d("2029-02-28T00:00:00Z"), "year", 1))).toBe("2030-02-28T00:00:00.000Z");
    });

    it("rolls over the year boundary", () => {
        expect(iso(nextCycleDate(d("2026-11-20T00:00:00Z"), d("2026-12-20T00:00:00Z"), "month", 1)))
            .toBe("2027-01-20T00:00:00.000Z");
    });

    it("respects a hand-set nextDate on a different day", () => {
        // Started on the 1st but the user set the next renewal to the 20th.
        expect(iso(nextCycleDate(d("2026-01-01T00:00:00Z"), d("2026-03-20T00:00:00Z"), "month", 1)))
            .toBe("2026-04-20T00:00:00.000Z");
    });

    it("always moves strictly forward, even for bad counts", () => {
        const start = d("2026-01-01T00:00:00Z");
        expect(nextCycleDate(start, start, "month", 0).getTime()).toBeGreaterThan(start.getTime());
    });
});

describe("isChargeableOn", () => {
    const sub = monthly();
    it("charges while active and inside the window", () => {
        expect(isChargeableOn(sub, d("2026-03-15T10:00:00Z"))).toBe(true);
    });
    it("does not charge before the start or after the end", () => {
        expect(isChargeableOn(sub, d("2026-01-01T00:00:00Z"))).toBe(false);
        expect(isChargeableOn(monthly({ endDate: d("2026-03-01T00:00:00Z") }), d("2026-04-15T10:00:00Z"))).toBe(false);
    });
    it("does not charge an inactive subscription with no deactivation date", () => {
        expect(isChargeableOn(monthly({ active: false }), d("2026-03-15T10:00:00Z"))).toBe(false);
    });
    it("charges cycles before deactivation but not after", () => {
        const paused = monthly({ active: false, deactivatedAt: d("2026-04-01T00:00:00Z") });
        expect(isChargeableOn(paused, d("2026-03-15T10:00:00Z"))).toBe(true);
        expect(isChargeableOn(paused, d("2026-04-15T10:00:00Z"))).toBe(false);
    });
});

describe("planRenewals", () => {
    it("does nothing when nextDate is still in the future", () => {
        const plan = planRenewals(monthly({ nextDate: d("2026-12-15T10:00:00Z") }), d("2026-11-01T00:00:00Z"));
        expect(plan.cycles).toEqual([]);
        expect(iso(plan.nextDate)).toBe("2026-12-15T10:00:00.000Z");
        expect(plan.capped).toBe(false);
    });

    it("catches up every missed cycle and lands on the first future date", () => {
        // nextDate Feb 15; now Nov 1 -> Feb..Oct charged, next is Nov 15.
        const plan = planRenewals(monthly(), d("2026-11-01T00:00:00Z"));
        expect(plan.cycles.map((c) => iso(c.date).slice(0, 10))).toEqual([
            "2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15",
            "2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15",
        ]);
        expect(plan.cycles.every((c) => c.charge)).toBe(true);
        expect(iso(plan.nextDate)).toBe("2026-11-15T10:00:00.000Z");
    });

    it("treats a cycle exactly at `now` as due", () => {
        const plan = planRenewals(monthly({ nextDate: d("2026-11-01T00:00:00Z") }), d("2026-11-01T00:00:00Z"));
        expect(plan.cycles).toHaveLength(1);
        expect(iso(plan.nextDate)).toBe("2026-12-01T00:00:00.000Z");
    });

    it("produces no duplicate dates", () => {
        const plan = planRenewals(monthly(), d("2030-01-01T00:00:00Z"));
        const dates = plan.cycles.map((c) => c.date.getTime());
        expect(new Set(dates).size).toBe(dates.length);
    });

    it("is idempotent: planning from the returned nextDate yields nothing", () => {
        const now = d("2026-11-01T00:00:00Z");
        const first = planRenewals(monthly(), now);
        const second = planRenewals(monthly({ nextDate: first.nextDate }), now);
        expect(second.cycles).toEqual([]);
        expect(second.nextDate).toEqual(first.nextDate);
    });

    it("advances past an inactive subscription without charging", () => {
        const plan = planRenewals(monthly({ active: false, deactivatedAt: d("2026-02-20T00:00:00Z") }), d("2026-06-01T00:00:00Z"));
        // Feb 15 is before the Feb 20 deactivation, so it is a real charge;
        // Mar 15, Apr 15 and May 15 are passed over without charging.
        expect(plan.cycles.map((c) => c.charge)).toEqual([true, false, false, false]);
        expect(plan.nextDate.getTime()).toBeGreaterThan(d("2026-06-01T00:00:00Z").getTime());
    });

    it("stops charging at the end date but still advances nextDate", () => {
        const plan = planRenewals(monthly({ endDate: d("2026-04-30T00:00:00Z") }), d("2026-08-01T00:00:00Z"));
        const charged = plan.cycles.filter((c) => c.charge).map((c) => iso(c.date).slice(0, 10));
        expect(charged).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
        expect(plan.nextDate.getTime()).toBeGreaterThan(d("2026-08-01T00:00:00Z").getTime());
    });

    it("caps one run and leaves nextDate in the past so tomorrow continues", () => {
        const plan = planRenewals(monthly({ nextDate: d("2000-01-15T10:00:00Z"), startDate: d("2000-01-15T10:00:00Z") }), d("2026-11-01T00:00:00Z"));
        expect(plan.cycles).toHaveLength(MAX_CYCLES_PER_RUN);
        expect(plan.capped).toBe(true);
        expect(plan.nextDate.getTime()).toBeLessThanOrEqual(d("2026-11-01T00:00:00Z").getTime());
    });

    describe("archived ledger", () => {
        it("charges cycles before the ledger was archived, not after, and still advances", () => {
            const plan = planRenewals(
                monthly({ ledgerArchivedAt: d("2026-04-20T00:00:00Z") }),
                d("2026-08-01T00:00:00Z"),
            );
            // Feb 15, Mar 15, Apr 15 are before Apr 20; May..Jul are frozen.
            expect(plan.cycles.map((c) => c.charge)).toEqual([true, true, true, false, false, false]);
            expect(plan.nextDate.getTime()).toBeGreaterThan(d("2026-08-01T00:00:00Z").getTime());
        });

        it("records nothing for a ledger archived before the first due cycle", () => {
            const plan = planRenewals(
                monthly({ ledgerArchivedAt: d("2026-01-20T00:00:00Z") }),
                d("2026-06-01T00:00:00Z"),
            );
            expect(plan.cycles.every((c) => !c.charge)).toBe(true);
            expect(plan.cycles.length).toBeGreaterThan(0);
        });

        it("a restored ledger (archivedAt back to null) charges normally again", () => {
            const plan = planRenewals(monthly({ ledgerArchivedAt: null }), d("2026-04-01T00:00:00Z"));
            expect(plan.cycles.every((c) => c.charge)).toBe(true);
        });

        it("restoring does not back-charge the frozen gap", () => {
            const now = d("2026-08-01T00:00:00Z");
            const frozen = planRenewals(monthly({ ledgerArchivedAt: d("2026-04-20T00:00:00Z") }), now);
            // After restore the stored nextDate is the one the frozen run left.
            const afterRestore = planRenewals(monthly({ nextDate: frozen.nextDate, ledgerArchivedAt: null }), now);
            expect(afterRestore.cycles).toEqual([]);
        });
    });
});

