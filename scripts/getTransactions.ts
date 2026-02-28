import {db} from '../db/index'
import { eq } from "drizzle-orm";

import { transactions, categories } from "../db/schema"; // adjust path

export async function Get() {
    const result = await db
        .select({
            id: transactions.id,
            title: transactions.title,
            amount: transactions.amount,
            type: transactions.type,
            createdAt: transactions.createdAt,
            category: {
                id: categories.id,
                name: categories.name,
                color: categories.color,
            },
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(eq(transactions.userId, "user_123"))
        .orderBy(transactions.createdAt);

    console.log(JSON.stringify(result, null, 2));
}

Get().catch(console.error);
