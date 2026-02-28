import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { categories, transactions } from "../db/schema"; // adjust path

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
    console.log("🌱 Seeding database...");

    // Insert categories
    const insertedCategories = await db
        .insert(categories)
        .values([
            {
                name: "Food",
                icon: "🍔",
                color: "#FF5733",
                userId: null,
            },
            {
                name: "Subscriptions",
                icon: "📺",
                color: "#3357FF",
                userId: null,
            },
        ])
        .returning();

    console.log("✅ Categories inserted");

    const [foodCategory, subCategory] = insertedCategories;

    // Insert transactions
    await db.insert(transactions).values([
        {
            userId: "user_123",
            type: "expense",
            title: "McDonald's",
            amount: "12.50",
            categoryId: foodCategory.id,
        },
        {
            userId: "user_123",
            type: "subscription",
            title: "Netflix",
            amount: "15.99",
            categoryId: subCategory.id,
        },
    ]);

    console.log("✅ Transactions inserted");
    console.log("🎉 Seeding complete");
}

main().catch((err) => {
    console.error("❌ Seeding failed:", err);
});
