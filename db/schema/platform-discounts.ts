import { boolean, decimal, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    isActive: boolean("is_active").notNull().default(true),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PlatformDiscount = typeof platformDiscounts.$inferSelect;
