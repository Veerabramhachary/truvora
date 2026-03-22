import { db } from "@/db";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import { eq } from "drizzle-orm";

export const Post = async () => {
    const [getCategory] = await db
        .select({ categoryId: categories.id })
        .from(categories)
        .where(eq(categories.name, "Mobile Apps"));

    if (!getCategory) {
        throw new Error("Category 'Entertaiment' not found");
    }
    const res = await db.transaction(async (tx) => {
        try {
            const [subscription] = await tx
                .insert(subscriptions)
                .values({
                    userId: process.env.DEV_ID!,
                    name: "Netflix",
                    note: "Standard HD plan",
                    price: "15.49",
                    currency: "USD",
                    interval: "month",
                    intervalCount: 1,
                    endDate: new Date('2027-03-17T10:00:00'),
                    startDate: new Date('2026-03-17T10:00:00'),
                    categoryId: getCategory.categoryId,
                    nextDate: new Date('2027-03-17T10:00:00'),
                    deactivatedAt: null,
                    active: true
                })
                .returning({ id: subscriptions.id });
            console.log("Inserted subscription:", subscription);

            await tx.insert(transactions).values({
                title: "Netflix",
                userId: process.env.DEV_ID!,
                categoryId: getCategory.categoryId,
                amount: "40",
                date: new Date('2026-03-17T10:00:00'),
                description: "Standard HD plan",
                type: "subscription",
                action: "created",
                currency: "USD",
                createdAt: new Date(),
            });

            return subscription;
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
