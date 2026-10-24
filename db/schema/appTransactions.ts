import { decimal, pgEnum, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { app_subscriptions } from "./plans";
import { paymentInvoices } from "./appInvoices";
import { encryptedJson, encryptedText } from "./custom-types";

// NOTE: the Postgres type name must not collide with the `transaction_type`
// enum declared in `./schema` (expense | income | subscription). Both are
// schema-global, so reusing the name silently overwrote one of the two value
// sets and made `payment_transactions.type` reject every payment row.
export const appTransactionTypeEnum = pgEnum('payment_transaction_type', [
    'payment',
    'refund',
    'adjustment',
    'chargeback'
]);

export const appTransactionStatusEnum = pgEnum('transaction_status', [
    'pending',
    'succeeded',
    'failed',
    'refunded',
]);

export const paymentTransactions = pgTable('payment_transactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionsId: uuid('subscriptions_id').references(() => app_subscriptions.id),
    invoiceId: uuid('invoice_id').references(() => paymentInvoices.id),
    type: appTransactionTypeEnum('type').notNull(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    status: appTransactionStatusEnum('status').default('pending'),
    paymentMethod: text('payment_method'),
    idempotencyKey: text('idemptency_key').unique(),
    providerTransactionId: text('provider_transaction_id'),
    errorMessage: encryptedText('error_message'),
    metadata: encryptedJson<Record<string, unknown>>()('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
})
