import { relations } from "drizzle-orm";
import { boolean, decimal, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const platformDiscountRedemptionStatusEnum = pgEnum(
    "platform_discount_redemption_status",
    ["reserved", "redeemed", "released"],
);

/** Campaign terms and billing-provider mapping for acquisition platforms. */
export const platformDiscounts = pgTable("platform_discounts", {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: text("platform").notNull().unique(),
    name: text("name").notNull(),
    discountType: text("discount_type").notNull(), // percent | amount
    discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency"),
    duration: text("duration").notNull().default("once"), // once | repeating | forever
    durationInMonths: integer("duration_in_months"),
    providerCouponId: text("provider_coupon_id"),
    maxRedemptions: integer("max_redemptions").notNull().default(50),
    isActive: boolean("is_active").notNull().default(true),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const platformDiscountRedemptions = pgTable(
    "platform_discount_redemptions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        campaignId: uuid("campaign_id")
            .notNull()
            .references(() => platformDiscounts.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        checkoutSessionId: text("checkout_session_id").unique(),
        status: platformDiscountRedemptionStatusEnum("status")
            .notNull()
            .default("reserved"),
        reservedAt: timestamp("reserved_at").defaultNow().notNull(),
        redeemedAt: timestamp("redeemed_at"),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => [
        uniqueIndex("platform_discount_redemptions_campaign_user_unique").on(
            table.campaignId,
            table.userId,
        ),
    ],
);

export const platformDiscountsRelations = relations(
    platformDiscounts,
    ({ many }) => ({
        redemptions: many(platformDiscountRedemptions),
    }),
);

export type PlatformDiscount = typeof platformDiscounts.$inferSelect;
