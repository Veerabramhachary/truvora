import {
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const ledgerTypeEnum = pgEnum("ledger_type", ["personal", "business"]);

/**
 * A ledger is the unit of financial data separation: every expense,
 * transaction, subscription and custom category belongs to exactly one.
 *
 * Phase 3 (workspaces) will add `workspace_id` here plus a membership table;
 * until then `owner_user_id` is the only access rule, enforced in one place
 * (`requireLedger`).
 */
export const ledgers = pgTable(
    "ledgers",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        ownerUserId: text("owner_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        type: ledgerTypeEnum("type").notNull(),
        name: text("name").notNull(),
        archivedAt: timestamp("archived_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => [
        index("ledgers_owner_idx").on(table.ownerUserId),
        // Exactly one personal ledger per user. Business ledgers are not
        // constrained here: the launch cap of one is an application rule.
        uniqueIndex("ledgers_one_personal_per_owner")
            .on(table.ownerUserId)
            .where(sql`${table.type} = 'personal'`),
    ],
);

export type Ledger = typeof ledgers.$inferSelect;
