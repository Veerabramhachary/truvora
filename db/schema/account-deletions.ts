import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const accountDeletions = pgTable(
    "account_deletions",
    {
        clerkUserId: text("clerk_user_id").primaryKey(),
        status: text("status").notNull().default("pending"),
        statusTokenHash: text("status_token_hash"),
        attemptCount: integer("attempt_count").notNull().default(0),
        nextRetryAt: timestamp("next_retry_at").defaultNow().notNull(),
        lastError: text("last_error"),
        requestedAt: timestamp("requested_at").defaultNow().notNull(),
        clerkDeletedAt: timestamp("clerk_deleted_at"),
        dataDeletedAt: timestamp("data_deleted_at"),
        completedAt: timestamp("completed_at"),
    },
    (table) => [
        index("account_deletions_retry_idx").on(table.status, table.nextRetryAt),
        uniqueIndex("account_deletions_status_token_hash_unique").on(table.statusTokenHash),
    ],
);
