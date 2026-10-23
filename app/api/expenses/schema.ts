import { z } from "zod";

/**
 * Shared request contract for creating and editing an expense.
 *
 * Kept out of `route.ts` so the `POST /api/expenses` and
 * `PATCH /api/expenses/[id]` handlers can't drift apart.
 */
export const expenseSchema = z.object({
    title: z.string().min(1),
    note: z.string().optional(),
    // The form sends a number (z.coerce.number on the client). Accept both a
    // number and a numeric string so the contract can't drift again.
    amount: z.coerce
        .number({ error: "Invalid amount format" })
        .positive("Amount must be greater than 0"),
    date: z.coerce.date(),
    type: z.enum(["income", "expense"]),
    /** Display label of a row in `categories` (see components/category-selector). */
    category: z.string().min(1),
    currency: z.string().min(1),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
