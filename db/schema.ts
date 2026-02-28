// src/db/schema.ts
import { sql } from "drizzle-orm";
import {
    pgTable,
    text,
    numeric,
    timestamp,
    uuid,
    pgEnum,
    index,
    check,
} from "drizzle-orm/pg-core";

export const transactionTypeEnum = pgEnum("transaction_type", [
    "expense",
    "subscription",
]);
export const transactionsStatusEnum = pgEnum("transaction_status", [
    "active",
    "cancel",
    "de-active"
])

export const categories = pgTable(
    "categories",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        icon: text("icon"),
        color: text("color"),
        userId: text("user_id"), // Nullable for "Default"
    },
    (table) => ({
        userIndex: index("category_user_idx").on(table.userId),
    }),
);

export const transactions = pgTable(
    "transactions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id").notNull(),
        type: transactionTypeEnum("type").notNull(),
        title: text("title").notNull(),
        amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
        status: transactionsStatusEnum("status"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        categoryId: uuid("category_id")
            .references(() => categories.id)
            .notNull(),
    },
    (table) => ({
        userIndex: index("trans_user_idx").on(table.userId),
        createdIndex: index("trans_created_idx").on(table.createdAt),
        statusTypeCheck: check(
            "status_type_check",
            sql`CASE
                    WHEN ${table.type} = 'expense' THEN ${table.status} IS NULL
                    ELSE TRUE
                END`
        ),
    }),
);
