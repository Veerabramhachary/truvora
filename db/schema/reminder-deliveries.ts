import { integer, pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";

export const reminderDeliveries = pgTable("reminder_deliveries", {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id").notNull(),
    renewalDate: timestamp("renewal_date").notNull(),
    daysBefore: integer("days_before").notNull(),
    status: text("status").notNull().default("sending"),
    claimedAt: timestamp("claimed_at").notNull().defaultNow(),
    sentAt: timestamp("sent_at"),
}, (table) => ({
    deliveryKey: unique().on(table.subscriptionId, table.renewalDate, table.daysBefore),
}));
