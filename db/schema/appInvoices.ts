import {
    decimal,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { app_subscriptions } from "./plans";
import { encryptedJson } from "./custom-types";

export const invoiceStatusEnum = pgEnum("invoice_status", [
    "draft",
    "open",
    "paid",
    "unpaid",
    "void",
]);

export const paymentInvoices = pgTable("payment_invoices", {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").references(() => app_subscriptions.id),
    providerInvoiceId: text("provider_invoice_id").unique(),
    invoiceNumber: text("invoice_number").unique(),
    amountDue: decimal("amount_due", { precision: 10, scale: 2 }).notNull(),
    amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default('0'),
    currency: text("currency").notNull(),
    status: invoiceStatusEnum("status").default("draft"),
    dueDate: timestamp("due_date"),
    paidAt: timestamp("paid_at"),
    lines: encryptedJson<
        Array<{
            description: string;
            amount: number;
            period?: { start: Date; end: Date };
        }>>()("lines"),
    metadata: encryptedJson<Record<string, unknown>>()("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
