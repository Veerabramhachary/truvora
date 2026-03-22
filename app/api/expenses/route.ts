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
            return NextResponse.json({error:"Unauthorized"}, { status: 401 });
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

        return NextResponse.json({
            success: true,
            data,
        }, { status: 200 });
    } catch (err) {
        return NextResponse.json({
            success: false,
            error: "Internal server error",
        }, { status: 500 });
    }
}
const expenseSchema = z.object({
    title: z.string().min(1),
    note: z.string().optional(),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
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
                currency: data.currency,
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
        if(error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: error.message},
                { status: 400}
            )
        }
        return new Response(
            JSON.stringify({
                success: false,
                error: "Internal server error"
            }),
            { status: 500 },
        );
    }
};
