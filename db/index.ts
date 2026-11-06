// @next/env is CJS whose named exports are defined with Object.defineProperty,
// which Node's ESM named-export detection (cjs-module-lexer) cannot see — the
// default import (module.exports) is the interop-safe way under "type": "module".
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as baseSchema from "./schema/schema";
import { app_subscriptions } from "./schema/plans";
import {subscriptions, transactions, categories } from './schema/schema'
import { paymentTransactions } from "./schema/appTransactions";
import { paymentOrders } from "./schema/payment-orders";
import { accountDeletions } from "./schema/account-deletions";
import { ledgers } from "./schema/ledgers";

nextEnv.loadEnvConfig(process.cwd());

export const schema = {
    ...baseSchema,
    app_subscriptions,
    subscriptions,
    transactions,
    categories,
    paymentTransactions,
    paymentOrders,
    accountDeletions,
    ledgers,
};
const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
});

export const db = drizzle(pool, { schema });
export const closeDb = () => pool.end();
