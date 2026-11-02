import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { platformDiscounts } from "./platform-discounts";


export const users = pgTable("users", {
    id: text("id").primaryKey(), // matches Clerk user ID
    email: text("email").notNull(),
    firstName: text("first_name"),
    imageUrl: text("image_url"),
    referralPlatform: text("referral_platform"),
    platformDiscountId: uuid("platform_discount_id").references(() => platformDiscounts.id, { onDelete: "set null" }),
    stripeCustomerId: text("stripe_customer_id").unique(),
    // NULL until the sign-up wizard is finished or skipped. Existing users are
    // backfilled in migration 0014 so they are never sent through it.
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
