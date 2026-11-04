import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Tax tracking (F-05), business ledgers only. Kept in its own file so the
 * expenses, subscriptions and transactions tables can all import it without
 * a circular import.
 *
 *  - deductible      an expense that can be deducted
 *  - tax_paid        tax actually paid (advance tax, GST payment, ...)
 *  - taxable_income  income that counts toward tax
 *  - tax_refund      tax money received back
 */
export const TAX_KINDS = ["deductible", "tax_paid", "taxable_income", "tax_refund"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

export const taxKindEnum = pgEnum("tax_kind", TAX_KINDS);
