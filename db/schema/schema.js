"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptions = exports.transactions = exports.categories = exports.transactionActionEnum = exports.transactionTypeEnum = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var custom_types_1 = require("./custom-types");
exports.transactionTypeEnum = (0, pg_core_1.pgEnum)("transaction_type", [
    "expense",
    "income",
    "subscription"
]);
exports.transactionActionEnum = (0, pg_core_1.pgEnum)("trasaction_action", [
    "created",
    "updated",
    "deleted",
]);
exports.categories = (0, pg_core_1.pgTable)("categories", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)("name").notNull().unique(), // Added unique for FK reference
    icon: (0, pg_core_1.text)("icon"),
    color: (0, pg_core_1.text)("color"),
    userId: (0, pg_core_1.text)("user_id"),
    // 1. Changed from uuid to text
    parentName: (0, pg_core_1.text)("parent_name"),
}, function (table) { return ({
    // 2. Updated foreign key to point to the 'name' column
    parentFk: (0, pg_core_1.foreignKey)({
        columns: [table.parentName],
        foreignColumns: [table.name],
        name: "category_parent_fk",
    }).onDelete("cascade"),
    userIndex: (0, pg_core_1.index)("category_user_idx").on(table.userId),
}); });
exports.transactions = (0, pg_core_1.pgTable)("transactions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.text)("user_id").notNull(),
    title: (0, pg_core_1.text)("title").notNull().default('untitled'),
    categoryId: (0, pg_core_1.uuid)("category_id").references(function () { return exports.categories.id; }),
    amount: (0, pg_core_1.numeric)("amount", { precision: 10, scale: 2 }).notNull(),
    date: (0, pg_core_1.timestamp)("date").notNull(),
    description: (0, custom_types_1.encryptedText)("description"),
    type: (0, exports.transactionTypeEnum)("type").notNull(),
    subscriptionId: (0, pg_core_1.uuid)("subscription_id").references(function () { return exports.subscriptions.id; }),
    action: (0, exports.transactionActionEnum)("action").notNull(),
    currency: (0, pg_core_1.text)("currency").notNull().default("USD"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
exports.subscriptions = (0, pg_core_1.pgTable)("subscriptions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.text)("user_id").notNull(),
    categoryId: (0, pg_core_1.uuid)("category_id").references(function () { return exports.categories.id; }),
    name: (0, pg_core_1.text)("name").notNull(),
    note: (0, custom_types_1.encryptedText)("note"),
    price: (0, pg_core_1.numeric)("price", { precision: 10, scale: 2 }).notNull(),
    currency: (0, pg_core_1.text)("currency").notNull().default("USD"),
    interval: (0, pg_core_1.text)("interval").notNull(),
    intervalCount: (0, pg_core_1.integer)("interval_count").notNull().default(1),
    startDate: (0, pg_core_1.timestamp)("start_date").notNull(),
    endDate: (0, pg_core_1.timestamp)("end_date").notNull(),
    deactivatedAt: (0, pg_core_1.timestamp)("deactivated_at"),
    nextDate: (0, pg_core_1.timestamp)("next_date").notNull(),
    active: (0, pg_core_1.boolean)("active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
