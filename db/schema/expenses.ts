import { decimal, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { categories } from "./schema";
import { ledgers } from "./ledgers";
import { encryptedText } from "./custom-types";
export const expenseType = pgEnum('expense_type', [
    'income',
    'expense'
])
export const expenses = pgTable("expenses", {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    // NOT NULL from step 4 of the rollout: every ledger-scoped row names its
    // ledger (01_backfill + 02_verify already proved no row is left NULL).
    ledgerId: uuid('ledger_id').notNull().references(() => ledgers.id),
    title: encryptedText('title').notNull(),
    note: encryptedText('note'),
    amount: decimal('amount',{ precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('INR'),
    date: timestamp("date").notNull(),
    type:expenseType('type').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
    index('expenses_ledger_date_idx').on(table.ledgerId, table.date),
]);

