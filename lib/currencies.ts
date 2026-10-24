/**
 * Currency supported by Truvora at launch.
 */
export type CurrencyCode = "INR";

export const DEFAULT_CURRENCY: CurrencyCode = "INR";

/** Formats a raw amount in `currency`, falling back to `CODE amount` if the
 * runtime doesn't recognise the code (e.g. a value written to the DB before a
 * currency was added here). */
export function formatCurrency(
    amount: number,
    currency: string = DEFAULT_CURRENCY,
): string {
    try {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}
