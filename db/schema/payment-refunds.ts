import { sql } from "drizzle-orm";
import {
    check,
    decimal,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";
import { app_subscriptions } from "./plans";
import { paymentOrders } from "./payment-orders";
import { users } from "./users";

export const paymentRefundKindEnum = pgEnum("payment_refund_kind", [
    "full_window",
    "prorated",
    "external",
]);

export const paymentRefundStatusEnum = pgEnum("payment_refund_status", [
    "requested",
    "pending",
    "processed",
    "failed",
]);

export const paymentRefundRequestedByEnum = pgEnum(
    "payment_refund_requested_by",
    ["user", "ops", "provider"],
);

/**
 * One row per refund attempt. `external` means it was created in the Razorpay
 * dashboard and discovered through a webhook.
 *
 * `status = 'requested'` means the row exists but Razorpay has not answered
 * yet; the reconciler retries those with the same idempotency key.
 */
export const paymentRefunds = pgTable(
    "payment_refunds",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        paymentOrderId: uuid("payment_order_id")
            .notNull()
            .references(() => paymentOrders.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        appSubscriptionId: uuid("app_subscription_id").references(
            () => app_subscriptions.id,
            { onDelete: "set null" },
        ),
        kind: paymentRefundKindEnum("kind").notNull(),
        status: paymentRefundStatusEnum("status").notNull().default("requested"),
        amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
        currency: text("currency").notNull(),
        /** `rfnd_…`. Unique, so webhook replays are no-ops. */
        providerRefundId: text("provider_refund_id").unique(),
        speedRequested: text("speed_requested").notNull().default("normal"),
        /** Inputs and result of the calculation, kept for disputes. */
        calc: jsonb("calc").$type<Record<string, unknown>>(),
        /** Provider error code only; never the raw provider body. */
        errorCode: text("error_code"),
        requestedBy: paymentRefundRequestedByEnum("requested_by").notNull(),
        processedAt: timestamp("processed_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => [
        check("payment_refunds_amount_positive", sql`${table.amount} > 0`),
        // A double click or two tabs must not create two refunds for one order.
        // Dashboard-issued refunds are excluded: they have no local request.
        uniqueIndex("payment_refunds_order_active_unique")
            .on(table.paymentOrderId)
            .where(
                sql`${table.status} IN ('requested', 'pending', 'processed') AND ${table.kind} <> 'external'`,
            ),
    ],
);

export type PaymentRefund = typeof paymentRefunds.$inferSelect;
export type NewPaymentRefund = typeof paymentRefunds.$inferInsert;
