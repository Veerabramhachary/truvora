import { db } from "@/db";
import { categories, transactions } from "@/db/schema/schema";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const data = await db
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
                date: transactions.date,
            })
            .from(transactions)
            .leftJoin(categories, eq(transactions.categoryId, categories.id))
            .where(eq(transactions.userId, userId))
            .orderBy(transactions.createdAt);

        return NextResponse.json(data);
    } catch (error) {
        console.error("Error fetching data:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}