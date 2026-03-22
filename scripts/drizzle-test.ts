// scripts/test-drizzle.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import { categories } from "../db/schema/schema";

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function main() {
    console.log("🚀 Testing Drizzle Connection...");

    const result = await db
        .insert(categories)
        .values({
            name: "Food",
            icon: "burger",
            color: "#FF0000",
        })
        .returning();

    console.log("✅ Success:", result);
    process.exit(0);
}

main();
