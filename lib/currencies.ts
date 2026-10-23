/**
 * Currencies Truvora accepts on its own forms.
 *
 * INR and AED come from the product decision to launch with Razorpay first
 * (INR is its native currency) while keeping room for Gulf/USD expansion.
 * The list is deliberately short — every entry needs a matching price row in
 * `plans` before it can be offered on the pricing page.
 */
export const CURRENCIES = [
    { code: "USD", label: "US Dollar" },
    { code: "AED", label: "UAE Dirham" },
    { code: "INR", label: "Indian Rupee" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

/** Formats a raw amount in `currency`, falling back to `CODE amount` if the
 * runtime doesn't recognise the code (e.g. a value written to the DB before a
 * currency was added here). */
export function formatCurrency(
    amount: number,
    currency: string = DEFAULT_CURRENCY,
): string {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
        }).format(amount);
    } catch {
        return `${currency} ${amount}`;
    }
}
