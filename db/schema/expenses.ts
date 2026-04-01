import { decimal, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { categories } from "./schema";
import { encryptedText } from "./custom-types";
export const expenseType = pgEnum('expense_type', [
    'income',
    'expense'
])
export const expenses = pgTable("expenses", {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    note: encryptedText('note'),
    amount: decimal('amount',{ precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    date: timestamp("date").notNull(),
    type:expenseType('type').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
});

