import { z } from "zod";
import { positiveMoneySchema } from "@/lib/money";

/** Shared request contract for creating and editing a subscription. */
export const subscriptionSchema = z.object({
    name: z.string().min(1),
    price: positiveMoneySchema,
    currency: z.string().min(1),
    interval: z.enum(["month", "year"]),
    intervalCount: z.number().int().positive().optional(),
    startDate: z.coerce.date(),
    // Optional for ongoing subscriptions — the server derives endDate/nextDate
    // when they're omitted.
    endDate: z.coerce.date().optional(),
    nextDate: z.coerce.date().optional(),
    /** Display label of a row in `categories` (see components/category-selector). */
    category: z.string().min(1),
    note: z.string().optional(),
    active: z.boolean().optional(),
    deactivatedAt: z.date().optional(),
});

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

/**
 * The form treats an ongoing subscription as having no end date, but the
 * `end_date` column is NOT NULL. Use a far-future sentinel so the row still
 * counts as active (see the `gte(endDate, now)` gate in lib/feature-access.ts).
 */
export const ONGOING_END_DATE = new Date("9999-12-31T00:00:00.000Z");

/** Treat a selected end date as valid through that calendar day. */
export function subscriptionEndDate(date?: Date): Date {
    if (!date) return ONGOING_END_DATE;
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    return end;
}

export function nextRenewalDate(
    startDate: Date,
    interval: "month" | "year",
    intervalCount?: number,
    now = new Date(),
): Date {
    const monthsPerCycle =
        (interval === "year" ? 12 : 1) *
        (intervalCount && intervalCount > 0 ? intervalCount : 1);
    const startMonth = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();
    const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
    );

    const dateForCycle = (cycle: number) => {
        const monthIndex = startMonth + cycle * monthsPerCycle;
        const year = Math.floor(monthIndex / 12);
        const month = monthIndex % 12;
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const next = new Date(startDate);
        next.setUTCFullYear(year, month, Math.min(startDate.getUTCDate(), lastDay));
        return next;
    };

    let cycle = Math.max(1, Math.floor((currentMonth - startMonth) / monthsPerCycle));
    let next = dateForCycle(cycle);
    while (Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate()) < today) {
        next = dateForCycle(++cycle);
    }
    return next;
}
