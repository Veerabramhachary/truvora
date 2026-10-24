import { z } from "zod";
import { positiveMoneySchema } from "@/lib/money";

/**
 * Shared request contract for creating and editing an expense.
 *
 * Kept out of `route.ts` so the `POST /api/expenses` and
 * `PATCH /api/expenses/[id]` handlers can't drift apart.
 */
export const expenseSchema = z.object({
    title: z.string().min(1),
    note: z.string().optional(),
    // Accept form numbers and decimal strings, then store validated paise
    // precision as an exact decimal string in Postgres NUMERIC.
    amount: positiveMoneySchema,
    date: z.coerce.date(),
    type: z.enum(["income", "expense"]),
    /** Display label of a row in `categories` (see components/category-selector). */
    category: z.string().min(1),
    currency: z.string().min(1),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
