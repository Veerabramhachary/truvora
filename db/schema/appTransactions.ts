import { decimal, pgEnum, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { app_subscriptions } from "./plans";
import { paymentInvoices } from "./appInvoices";
import { encryptedJson, encryptedText } from "./custom-types";

export const appTransactionTypeEnum = pgEnum('transaction_type', [
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
    metadata: encryptedJson<Record<string, any>>()('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
})