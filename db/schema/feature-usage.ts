import {
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const featureUsage = pgTable(
    "feature_usage",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        feature: text("feature").notNull(),
        period:text('period').notNull(),
        count: integer("count").default(0),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        uniq: unique().on(table.userId, table.feature, table.period),
    }),
);
