import {
    pgTable,
    text,
    numeric,
    timestamp,
    uuid,
    pgEnum,
    index,
    integer,
    boolean,
    check,
    foreignKey,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { encryptedText } from "./custom-types";
import { expenses } from "./expenses";
import { ledgers } from "./ledgers";

export const transactionTypeEnum = pgEnum("transaction_type", [
    "expense",
    "income",
    "subscription"
]);

export const transactionActionEnum = pgEnum("trasaction_action", [
    "created",
    "updated",
    // DEPRECATED: nothing writes or reads "deleted" any more (deleting a
    // subscription removes its rows). Postgres cannot drop a single enum
    // value without rebuilding the type, so it stays in the type; do not
    // add new logic that depends on it.
    "deleted",
])

export const customCategoryTypeEnum = pgEnum("custom_category_type", [
    "expense",
    "subscription",
]);

export const categories = pgTable(
    "categories",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull().unique(),
        icon: text("icon"),
        color: text("color"),
        userId: text("user_id"),
        // NULL for built-in categories (global); set for custom ones. The
        // ledger mirrors that: only custom categories are ledger-scoped, so
        // this stays nullable while expenses/subscriptions/transactions
        // went NOT NULL in step 4 (built-ins would have no owner ledger).
        ledgerId: uuid("ledger_id").references(() => ledgers.id),
        categoryType: customCategoryTypeEnum("category_type"),
        displayName: text("display_name"),
        parentName: text("parent_name"),
    },
    (table) => ({
        parentFk: foreignKey({
            columns: [table.parentName],
            foreignColumns: [table.name],
            name: "category_parent_fk",
        }).onDelete("cascade"),

        userIndex: index("category_user_idx").on(table.userId),
        ledgerIndex: index("category_ledger_idx").on(table.ledgerId),
        customCategoryNameUnique: uniqueIndex("categories_custom_owner_name_unique")
            .on(table.userId, table.categoryType, sql`lower(${table.displayName})`)
            .where(sql`${table.userId} IS NOT NULL AND ${table.categoryType} IS NOT NULL AND ${table.displayName} IS NOT NULL`),
    }),
);

export const transactions = pgTable("transactions", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    // NOT NULL from step 4 of the rollout: every ledger-scoped row names its
    // ledger (01_backfill + 02_verify already proved no row is left NULL).
    ledgerId: uuid("ledger_id").notNull().references(() => ledgers.id),
    title:  encryptedText("title").notNull().default('untitled'),
    categoryId: uuid("category_id").references(() => categories.id),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    date: timestamp("date").notNull(),
    description: encryptedText("description"),
    type: transactionTypeEnum("type").notNull(),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    expenseId: uuid("expense_id").unique().references(() => expenses.id, { onDelete: "cascade" }),
    action: transactionActionEnum("action").notNull(),
    currency: text("currency").notNull().default("INR"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    index("transactions_ledger_date_idx").on(table.ledgerId, table.date),
]);

export const subscriptions = pgTable("subscriptions", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    // NOT NULL from step 4 of the rollout: every ledger-scoped row names its
    // ledger (01_backfill + 02_verify already proved no row is left NULL).
    ledgerId: uuid("ledger_id").notNull().references(() => ledgers.id),
    categoryId: uuid("category_id").references(() => categories.id),
    name: encryptedText("name").notNull(),
    note: encryptedText("note"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("INR"),
    interval: text("interval").notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    deactivatedAt: timestamp("deactivated_at"),
    nextDate: timestamp("next_date").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    index("subscriptions_ledger_idx").on(table.ledgerId),
    check("subscriptions_interval_count_positive", sql`${table.intervalCount} > 0`),
]);
