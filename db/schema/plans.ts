import {
    pgTable,
    text,
    integer,
    decimal,
    pgEnum,
    jsonb,
    boolean,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { relations } from "drizzle-orm";
import { paymentInvoices } from "./appInvoices";
import { paymentTransactions } from "./appTransactions";

export const intervalEnum = pgEnum("plan_interval", ["month", "year"]);

export const app_subscriptionsStatusEnum = pgEnum("app_subscriptions_status", [
    "active",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "past_due",
    "trialing",
    "unpaid",
]);
export const paymentProviderEnum = pgEnum("payment_provider", [
    "stripe",
    "paypal",
    "braintree",
    "none",
]);

export type FeatureLimits = {
    exports?: { limit: number; interval: 'month' | 'year' | 'none' }; // monthly export cap
    subscriptions?: { limit: number }; // max active subscriptions
    charts?: 'basic' | 'comparative' | 'advanced'; // chart type tier
    earlyAccess?: boolean;
    autoRenewal?: boolean;
    reminders?: 'email' | 'priority' | 'customizable' | 'personalized';
    exportFormats?: { csv: boolean; pdf: boolean; pdfLevel: 'none' | 'basic' | 'advanced'; xlsx: boolean };
    customCategories?: boolean;
    viewsAndFilters?: boolean;
    notifications?: 'email' | 'push' | 'webhook' | 'all';
    webhooks?: boolean; // whether user can define outgoing webhooks
    // ... any other feature
};

export const plans = pgTable("plans", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(), // e.g., "Pro Monthly"
    description: text("description"),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(), // store as string to avoid floating point
    currency: text("currency").notNull().default("INR"),
    interval: intervalEnum("plan_interval").notNull(),
    intervalCount: integer("interval_count").notNull().default(1), // e.g., 3 months
    trialDays: integer("trial_days").default(0),
    features: jsonb("features").$type<string[]>(), // array of feature strings
    featureLimits:jsonb('feature_limits').$type<FeatureLimits>(),
    isActive: boolean("is_active").default(true),
    provider: paymentProviderEnum('provider').notNull(),
    providerPlanId: text("provider_plan_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const app_subscriptions = pgTable("app_subscriptions", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id),
    planId: uuid("plan_id").references(() => plans.id),
    planSnapshot: jsonb("plan_snapshot").$type<{
        name: string;
        price: number;
        currency: string;
        interval: string;
        intervalCount: number;
    }>(),
    status: app_subscriptionsStatusEnum("status").notNull().default('incomplete'),
    // Billing Period
    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    // Cancelation
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    canceledAt: timestamp("canceled_at"),
    // trial
    trialStart: timestamp("trial_start"),
    trialEnd: timestamp("trial_end"),
    // payment method (could reference a payment_method table)
    paymentMethodId: uuid("payment_method_id"),

    provider: paymentProviderEnum("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").unique(),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const subscriptionsRelations = relations(
    app_subscriptions,
    ({ one, many }) => ({
        user: one(users, {
            fields: [app_subscriptions.userId],
            references: [users.id],
        }),
        plan: one(plans, {
            fields: [app_subscriptions.planId],
            references: [plans.id],
        }),
        invoices: many(paymentInvoices),
        transactionsTransactions: many(paymentTransactions),
    }),
);

