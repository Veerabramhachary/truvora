import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { desc, eq } from "drizzle-orm";
import { categories, transactions } from "@/db/schema/schema";
import { z } from "zod";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        // Authenticate user
        const { userId } = await auth();
        if (!userId) {
            return new Response(
                JSON.stringify({ error: "Not authenticated" }),
                {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
        // Fetch expenses for the authenticated user
        const data = await db
            .select({
                expenseId: expenses.id,
                title: expenses.title,
                type: expenses.type,
                amount: expenses.amount,
                date: expenses.date,
                description: expenses.note,
                categoryId: expenses.categoryId,
                categoryName: categories.name,
            })
            .from(expenses)
            .leftJoin(categories, eq(expenses.categoryId, categories.id))
            .where(eq(expenses.userId, userId))
            .orderBy(desc(expenses.date));

        console.log(`Fetched ${data.length} expenses for user ${userId}`);

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Failed to fetch expenses:", err);
        return new Response(
            JSON.stringify({ error: "Failed to fetch expenses" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }
}
const expenseSchema = z.object({
    title: z.string().min(1),
    note: z.string().optional(),
    amount: z.coerce.string(),
    date: z.coerce.date(),
    type: z.enum(["income", "expense"]),
    category: z.string().min(1),
    currency: z.string().min(1),
});
export const POST = async (req: Request) => {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({error:"Unauthorized"}, { status: 401 });
        }

        const body = await req.json();
        const data = expenseSchema.parse(body);

        const categoryResult = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.name, data.category));

        const category = categoryResult[0];
        if (!category) {
            return NextResponse.json(
                        { error: "Category not found" },
                        { status: 404 },
                    );
        }

        await db.transaction(async (tx) => {
            await tx.insert(expenses).values({
                title: data.title,
                note: data.note,
                amount: data.amount,
                date: data.date,
                type: data.type,
                categoryId: category.id,
                userId: userId,
            });

            await tx.insert(transactions).values({
                title: data.title,
                description: data.note,
                amount: data.amount,
                date: data.date,
                type: data.type,
                userId: userId,
                categoryId: category.id,
                action: "created",
                currency: data.currency,
                createdAt: new Date(),
            });
        });

        return Response.json({
            success: true,
        });
    } catch (error) {
        return new Response(
            JSON.stringify({
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Something went wrong",
            }),
            { status: 400 },
        );
    }
};
