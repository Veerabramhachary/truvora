/**
 * Billing-cycle maths for subscriptions (F-02/F-03).
 *
 * Pure functions, no database. Everything is computed in UTC, matching
 * `nextRenewalDate` in app/api/subscriptions/schema.ts.
 */

/** Upper bound on cycles recorded for one subscription in one run. */
export const MAX_CYCLES_PER_RUN = 120;

function lastDayOfMonth(year: number, monthIndex: number): number {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The cycle date after `current`.
 *
 * Steps whole cycles (`intervalCount` months, or years x 12) and keeps the
 * time of day of `current`. The day of month is anchored on `startDate`, so a
 * subscription started on the 31st bills Jan 31, Feb 28, Mar 31 instead of
 * drifting to the 28th for good.
 *
 * If `current` sits on a day that is not the (clamped) start day, the user set
 * the date by hand; that day becomes the anchor instead.
 */
export function nextCycleDate(
    startDate: Date,
    current: Date,
    interval: string,
    intervalCount: number,
): Date {
    const months =
        (interval === "year" ? 12 : 1) * (intervalCount > 0 ? intervalCount : 1);
    const currentYear = current.getUTCFullYear();
    const currentMonth = current.getUTCMonth();

    const startDay = startDate.getUTCDate();
    const clampedStartDay = Math.min(startDay, lastDayOfMonth(currentYear, currentMonth));
    const anchorDay =
        current.getUTCDate() === clampedStartDay ? startDay : current.getUTCDate();

    const monthIndex = currentYear * 12 + currentMonth + months;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const day = Math.min(anchorDay, lastDayOfMonth(year, month));

    return new Date(
        Date.UTC(
            year,
            month,
            day,
            current.getUTCHours(),
            current.getUTCMinutes(),
            current.getUTCSeconds(),
            current.getUTCMilliseconds(),
        ),
    );
}

export type RenewalSubscription = {
    active: boolean;
    startDate: Date;
    endDate: Date;
    deactivatedAt: Date | null;
    nextDate: Date;
    interval: string;
    intervalCount: number;
    /** When the subscription's ledger was archived, if it was. */
    ledgerArchivedAt?: Date | null;
};

/**
 * Was the subscription live on `date`, so that a charge on that date is real?
 * Cycles that fall before the start, after the end, in a period it was
 * deactivated, or once its ledger was archived are advanced past without
 * recording a charge (so restoring a ledger later never back-charges the gap).
 */
export function isChargeableOn(sub: RenewalSubscription, date: Date): boolean {
    if (date < sub.startDate || date > sub.endDate) return false;
    if (sub.ledgerArchivedAt && date >= sub.ledgerArchivedAt) return false;
    if (sub.deactivatedAt) return date < sub.deactivatedAt;
    return sub.active;
}

export type PlannedCycle = { date: Date; charge: boolean };

export type RenewalPlan = {
    /** Every cycle date that has passed, oldest first. */
    cycles: PlannedCycle[];
    /** The value `nextDate` should be set to. */
    nextDate: Date;
    /** True when the per-run cap stopped us before reaching the future. */
    capped: boolean;
};

/**
 * Catch a subscription up to `now`: list each missed cycle (and whether it
 * is a real charge) and the new `nextDate`. Never returns the same date twice,
 * so it cannot double-count a cycle by itself.
 */
export function planRenewals(
    sub: RenewalSubscription,
    now: Date,
    maxCycles: number = MAX_CYCLES_PER_RUN,
): RenewalPlan {
    const cycles: PlannedCycle[] = [];
    let cursor = sub.nextDate;
    while (cursor <= now && cycles.length < maxCycles) {
        cycles.push({ date: cursor, charge: isChargeableOn(sub, cursor) });
        cursor = nextCycleDate(sub.startDate, cursor, sub.interval, sub.intervalCount);
    }
    return { cycles, nextDate: cursor, capped: cursor <= now };
}
