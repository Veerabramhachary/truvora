import {
    decimal,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { paymentProviderEnum, plans } from "./plans";
import { users } from "./users";

/**
 * The lifecycle of a checkout attempt.
 *
 * `paid` is only ever written after a signature-verified Razorpay response
 * (browser verification or webhook). Nothing in the UI may set it.
 */
export const paymentOrderStatusEnum = pgEnum("payment_order_status", [
    "created",
    "attempted",
    "paid",
    "failed",
    "canceled",
    "expired",
]);

/**
 * One row per Razorpay order. This is the bridge between a browser checkout
 * and the subscription/invoice rows the app already understands.
 *
 * `providerOrderId` and `providerPaymentId` are unique so Razorpay webhook
 * retries and the browser's verify call cannot grant a plan twice.
 */
export const paymentOrders = pgTable("payment_orders", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
        .notNull()
        .references(() => plans.id),
    provider: paymentProviderEnum("provider").notNull(),
    providerOrderId: text("provider_order_id").notNull().unique(),
    providerPaymentId: text("provider_payment_id").unique(),
    receipt: text("receipt").notNull().unique(),
    /** Amount in the plan's currency, as a decimal string (Drizzle convention). */
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    amountPaid: decimal("amount_paid", { precision: 10, scale: 2 })
        .notNull()
        .default("0.00"),
    currency: text("currency").notNull().default("INR"),
    status: paymentOrderStatusEnum("status").notNull().default("created"),
    notes: jsonb("notes").$type<Record<string, string>>(),
    failureReason: text("failure_reason"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type NewPaymentOrder = typeof paymentOrders.$inferInsert;
