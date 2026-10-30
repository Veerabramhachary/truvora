import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as baseSchema from "./schema/schema";
import { app_subscriptions } from "./schema/plans";
import {subscriptions, transactions, categories } from './schema/schema'
import { paymentTransactions } from "./schema/appTransactions";
import { accountDeletions } from "./schema/account-deletions";
import { platformDiscountRedemptions } from "./schema/platform-discounts";

loadEnvConfig(process.cwd());

export const schema = {
    ...baseSchema,
    app_subscriptions,
    subscriptions,
    transactions,
    categories,
    paymentTransactions,
    accountDeletions,
    platformDiscountRedemptions,
};
const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
});

export const db = drizzle(pool, { schema });
export const closeDb = () => pool.end();
