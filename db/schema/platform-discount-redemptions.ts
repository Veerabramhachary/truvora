import {
    decimal,
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";
import { paymentOrders } from "./payment-orders";
import { platformDiscounts } from "./platform-discounts";
import { users } from "./users";

export const platformDiscountRedemptionStatusEnum = pgEnum(
    "platform_discount_redemption_status",
    ["pending", "completed", "failed", "refunded"],
);

/**
 * One row per user who has been assigned a platform (referral) discount.
 *
 * `user_id` is unique: a platform discount user coming from a specific
 * platform-posted URL gets the discount only once, ever. This is the
 * enforcement of "one per user total" — not one per campaign.
 *
 * Status starts `pending` at sign-up (webhook) and moves to `completed`
 * when the discount is actually applied at checkout (Phase 2), or
 * `failed`/`refunded` if the checkout never pays.
 */
export const platformDiscountRedemptions = pgTable(
    "platform_discount_redemptions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platformDiscountId: uuid("platform_discount_id")
            .notNull()
            .references(() => platformDiscounts.id, {
                onDelete: "cascade",
            }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        paymentOrderId: uuid("payment_order_id")
            .references(() => paymentOrders.id, { onDelete: "set null" }),
        status: platformDiscountRedemptionStatusEnum("status")
            .notNull()
            .default("pending"),
        amountOff: decimal("amount_off", { precision: 10, scale: 2 }),
        currency: text("currency"),
        redeemedAt: timestamp("redeemed_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        // One redemption per user TOTAL (across all campaigns).
        userUnique: uniqueIndex(
            "platform_discount_redemptions_user_id_unique",
        ).on(table.userId),
        campaignIdx: index(
            "platform_discount_redemptions_campaign_idx",
        ).on(table.platformDiscountId),
    }),
);

export type PlatformDiscountRedemption =
    typeof platformDiscountRedemptions.$inferSelect;
export type NewPlatformDiscountRedemption =
    typeof platformDiscountRedemptions.$inferInsert;
