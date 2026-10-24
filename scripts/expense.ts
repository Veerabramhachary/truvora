import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { categories, transactions } from "@/db/schema/schema";
import { inArray } from "drizzle-orm";

export const Post = async () => {
    const rawData = [
        // --- Category: shopping ---
        {
            title: "Monthly Grocery Run",
            note: "Restocked pantry and fresh produce from Whole Foods",
            amount: "145.5",
            date: new Date("2026-03-05T10:30:00Z"),
            type: "expense" as const,
            categoryName: "Groceries & Food",
            userId: process.env.DEV_ID!,
        },
        {
            title: "Birthday Gift for Mom",
            note: "Purchased a Kindle and a leather cover",
            amount: "129.99",
            date: new Date("2026-03-12T14:15:00Z"),
            type: "expense" as const,
            categoryName: "Electronics & Gadgets",
            userId: process.env.DEV_ID!,
        },
        {
            title: "New Spring Jacket",
            note: "Denim jacket for the changing weather",
            amount: "85.0",
            date: new Date("2026-03-02T18:45:00Z"),
            type: "expense" as const,
            categoryName: "Clothing & Accessories",
            userId: process.env.DEV_ID!,
        },

        // --- Category: travel ---
        {
            title: "Weekend Getaway Hotel",
            note: "2 nights at the Marriott Downtown",
            amount: "420.0",
            date: new Date("2026-03-07T12:00:00Z"),
            type: "expense" as const,
            categoryName: "Hotels & Accommodation",
            userId: process.env.DEV_ID!,
        },
        {
            title: "Flight to Chicago",
            note: "Round trip ticket for family visit",
            amount: "285.4",
            date: new Date("2026-03-10T09:00:00Z"),
            type: "expense" as const,
            categoryName: "Flights",
            userId: process.env.DEV_ID!,
        },
        {
            title: "Gas Station Refill",
            note: "Full tank for the road trip",
            amount: "55.25",
            date: new Date("2026-03-01T16:20:00Z"),
            type: "expense" as const,
            categoryName: "Fuel & Gas",
            userId: process.env.DEV_ID!,
        },
    ];
    const categoryNames = [...new Set(rawData.map((d) => d.categoryName))];
    const dbCategories = await db
        .select()
        .from(categories)
        .where(inArray(categories.name, categoryNames));

    // Create a lookup map: { "Groceries & Food": "uuid-123" }
    const categoryMap = Object.fromEntries(
        dbCategories.map((c) => [c.name, c.id]),
    );

    const expenseData = rawData.map((item) => {
        const categoryId = categoryMap[item.categoryName];
        if (!categoryId) {
            throw new Error(
                `Category '${item.categoryName}' not found in database`,
            );
        }

        // Remove categoryName and add categoryId. The rest-spread is how
        // `categoryName` gets dropped on purpose, so the unused binding is
        // expected rather than an oversight.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { categoryName, ...rest } = item;
        return { ...rest, categoryId };
    });

    const res = await db.transaction(async (tx) => {
        try {
            // Insert multiple expenses
            const insertedExpenses = await tx
                .insert(expenses)
                .values(expenseData)
                .returning({ id: expenses.id });

            // Logic Fix: You were passing the whole array to 'title'. 
            // I'll assume you want to log a transaction for the first inserted expense.
            await tx.insert(transactions).values({
                title: expenseData[0].title, // Fix: pass a string, not an array
                userId: process.env.DEV_ID!,
                categoryId: expenseData[0].categoryId,
                amount: expenseData[0].amount,
                date: new Date(),
                description: "Bulk expense import",
                type: "expense",
                action: "created",
                currency: "INR",
                createdAt: new Date(),
            });

            return insertedExpenses;
        } catch (err) {
            console.error("Transaction failed:", err);
            throw err;
        }
    });

    return res;
};

Post()
    .then((res) => {
        console.log("Result:", res);
        process.exit(0);
    })
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });
