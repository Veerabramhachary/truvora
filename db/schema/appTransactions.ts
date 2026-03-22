import { decimal, jsonb, pgEnum, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { app_subscriptions } from "./plans";
import { paymentInvoices } from "./appInvoices";

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
    idemptencyKey: text('idemptency_key').unique(),
    providerTransactionId: text('provider_transaction_id'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('create_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
})