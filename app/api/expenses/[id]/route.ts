import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { categories, transactions } from "@/db/schema/schema";
import { expenseSchema } from "../schema";

type Params = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

/**
 * Both handlers are `userId`-scoped: a valid id belonging to someone else is
 * indistinguishable from a missing one, so it can never be used to probe for
 * other people's rows.
 */
function scope(userId: string, id: string) {
    return and(eq(expenses.id, id), eq(expenses.userId, userId));
}

export async function PATCH(req: Request, { params }: Params) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = (await params).id;
        if (!idSchema.safeParse(id).success) {
            return NextResponse.json(
                { error: "Invalid expense id" },
                { status: 400 },
            );
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 },
            );
        }

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

        const updated = await db
            .update(expenses)
            .set({
                title: data.title,
                note: data.note,
                amount: data.amount.toFixed(2),
                date: data.date,
                type: data.type,
                categoryId: category.id,
                currency: data.currency,
                updatedAt: new Date(),
            })
            .where(scope(userId, id))
            .returning({ id: expenses.id });

        if (updated.length === 0) {
            return NextResponse.json(
                { error: "Expense not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ success: true, data: updated[0] });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.issues[0]?.message ?? "Invalid expense data" },
                { status: 400 },
            );
        }
        console.error("Expense update failed:", error);
        return NextResponse.json(
            { error: "Could not save the expense" },
            { status: 500 },
        );
    }
}

export async function DELETE(_req: Request, { params }: Params) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = (await params).id;
        if (!idSchema.safeParse(id).success) {
            return NextResponse.json(
                { error: "Invalid expense id" },
                { status: 400 },
            );
        }

        const deleted = await db
            .delete(expenses)
            .where(scope(userId, id))
            .returning({
                id: expenses.id,
                title: expenses.title,
                amount: expenses.amount,
                date: expenses.date,
                type: expenses.type,
            });

        if (deleted.length === 0) {
            return NextResponse.json(
                { error: "Expense not found" },
                { status: 404 },
            );
        }

        // Expenses are mirrored into the `transactions` ledger on create, but
        // that ledger row carries no `expense_id` — so the only way to avoid
        // leaving a ghost row behind is to match on the exact values that were
        // written. Look the row up first (Drizzle has no `DELETE ... LIMIT`),
        // scoped to this user, and only ever delete one.
        const removed = deleted[0];
        const [mirror] = await db
            .select({ id: transactions.id })
            .from(transactions)
            .where(
                and(
                    eq(transactions.userId, userId),
                    eq(transactions.title, removed.title),
                    eq(transactions.amount, removed.amount),
                    eq(transactions.type, removed.type),
                    eq(transactions.action, "created"),
                    eq(transactions.date, removed.date),
                ),
            )
            .limit(1);

        if (mirror) {
            await db.delete(transactions).where(eq(transactions.id, mirror.id));
        }

        return NextResponse.json({ success: true, data: removed });
    } catch (error) {
        console.error("Expense delete failed:", error);
        return NextResponse.json(
            { error: "Could not delete the expense" },
            { status: 500 },
        );
    }
}
