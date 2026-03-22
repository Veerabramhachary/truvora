// schema/relations.ts
import { relations } from "drizzle-orm";
import { categories } from "./schema";
import { paymentTransactions } from "./appTransactions";
import { app_subscriptions } from "./plans";
import { users } from "./users";

export const usersRelations = relations(users, ({ many }) => ({
    categories: many(categories),
    transactions: many(paymentTransactions),
    subscriptions: many(app_subscriptions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    user: one(users, { fields: [categories.userId], references: [users.id] }),
    transactions: many(paymentTransactions),
    subscriptions: many(app_subscriptions),
}));

export const transactionsRelations = relations(paymentTransactions, ({ one }) => ({
    subscription: one(app_subscriptions, {
        fields: [paymentTransactions.subscriptionsId],
        references: [app_subscriptions.id],
    }),
}));

export const subscriptionsRelations = relations(
    app_subscriptions,
    ({ one, many }) => ({
        user: one(users, {
            fields: [app_subscriptions.userId],
            references: [users.id],
        }),
        transactions: many(paymentTransactions),
    }),
);
