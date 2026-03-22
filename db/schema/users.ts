import { pgTable, text, timestamp } from "drizzle-orm/pg-core";


export const users = pgTable("users", {
    id: text("id").primaryKey(), // matches Clerk user ID
    email: text("email").notNull(),
    firstName: text("first_name"),
    imageUrl: text("image_url"),
    stripeCustomerId: text("stripe_customer_id").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
