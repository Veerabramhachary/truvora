import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { expenses } from "@/db/schema/expenses";
import { transactions } from "@/db/schema/schema";
import { expenseSchema } from "../schema";
import { resolveCategory } from "@/lib/category-access";
import { canUseFeature } from "@/lib/feature-access";
import { ledgerErrorResponse, requireLedger } from "@/lib/ledger";

type Params = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

/**
 * Both handlers are ledger-scoped (`requireLedger` has already verified the
 * caller owns the ledger): a valid id from another ledger or another user is
 * indistinguishable from a missing one, so it can never be used to probe for
 * other people's rows.
 */
function scope(ledgerId: string, id: string) {
    return and(eq(expenses.id, id), eq(expenses.ledgerId, ledgerId));
}

export async function PATCH(req: Request, { params }: Params) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const ledger = await requireLedger(req, userId);

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

        const [existingExpense] = await db.select({ currency: expenses.currency })
            .from(expenses).where(scope(ledger.id, id)).limit(1);
        if (!existingExpense) {
            return NextResponse.json({ error: "Expense not found" }, { status: 404 });
        }
        if (data.currency !== existingExpense.currency) {
            return NextResponse.json({ error: "Currency cannot be changed for an existing record" }, { status: 400 });
        }

        const category = await resolveCategory(
            ledger.id,
            data.category,
            data.type === "expense" ? "expense" : null,
        );
        if (!category) {
            return NextResponse.json(
                { error: "Category not found" },
                { status: 404 },
            );
        }
        if (category.isCustom && !(await canUseFeature(userId, "customCategories"))) {
            return NextResponse.json(
                { error: "Upgrade your plan to use custom categories" },
                { status: 403 },
            );
        }

        const updated = await db.transaction(async (tx) => {
            const updatedRows = await tx.update(expenses).set({
                title: data.title,
                note: data.note,
                amount: data.amount,
                date: data.date,
                type: data.type,
                categoryId: category.id,
                currency: data.currency,
                updatedAt: new Date(),
            }).where(scope(ledger.id, id)).returning({ id: expenses.id });
            if (updatedRows.length) {
                await tx.update(transactions).set({
                    title: data.title, description: data.note, amount: data.amount,
                    date: data.date, type: data.type, categoryId: category.id,
                    currency: data.currency, updatedAt: new Date(),
                }).where(and(eq(transactions.expenseId, id), eq(transactions.ledgerId, ledger.id)));
            }
            return updatedRows;
        });

        if (updated.length === 0) {
            return NextResponse.json(
                { error: "Expense not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ success: true, data: updated[0] });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
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

export async function DELETE(req: Request, { params }: Params) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const ledger = await requireLedger(req, userId);

        const id = (await params).id;
        if (!idSchema.safeParse(id).success) {
            return NextResponse.json(
                { error: "Invalid expense id" },
                { status: 400 },
            );
        }

        const deleted = await db.transaction(async (tx) => {
            const rows = await tx
            .delete(expenses)
            .where(scope(ledger.id, id))
            .returning({
                id: expenses.id,
                title: expenses.title,
                amount: expenses.amount,
                date: expenses.date,
                type: expenses.type,
            });
            if (rows.length) await tx.delete(transactions).where(and(eq(transactions.expenseId, id), eq(transactions.ledgerId, ledger.id)));
            return rows;
        });

        if (deleted.length === 0) {
            return NextResponse.json(
                { error: "Expense not found" },
                { status: 404 },
            );
        }

        const removed = deleted[0];

        return NextResponse.json({ success: true, data: removed });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Expense delete failed:", error);
        return NextResponse.json(
            { error: "Could not delete the expense" },
            { status: 500 },
        );
    }
}
