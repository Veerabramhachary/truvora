import { z } from "zod";
import { positiveMoneySchema } from "@/lib/money";

/** Shared request contract for creating and editing a subscription. */
export const subscriptionSchema = z.object({
    name: z.string().min(1),
    price: positiveMoneySchema,
    currency: z.string().min(1),
    interval: z.enum(["month", "year"]),
    intervalCount: z.number().optional(),
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

export function nextRenewalDate(
    startDate: Date,
    interval: "month" | "year",
    intervalCount?: number,
): Date {
    const months =
        (interval === "year" ? 12 : 1) *
        (intervalCount && intervalCount > 0 ? intervalCount : 1);
    const next = new Date(startDate);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
}
