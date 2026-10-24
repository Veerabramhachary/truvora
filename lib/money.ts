import { z } from "zod";

/**
 * INR values are stored as integer paise in application calculations and as
 * NUMERIC(10,2) in Postgres. Reject excess precision and values outside the
 * column range instead of relying on binary floating point rounding.
 */
export function toPaise(value: string): bigint {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) throw new Error("Invalid INR amount");
    const [, sign, rupees, fraction = ""] = match;
    if (/[1-9]/.test(fraction.slice(2))) {
        throw new Error("INR amounts cannot have fractions of a paise");
    }
    const paise = BigInt(rupees) * BigInt(100) + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
    return sign ? -paise : paise;
}

export function fromPaise(value: bigint): string {
    const negative = value < BigInt(0);
    const absolute = negative ? -value : value;
    return `${negative ? "-" : ""}${absolute / BigInt(100)}.${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}

/** Stripe amounts are integer paise. Convert without float division. */
export function fromMinorUnits(value: number): string {
    if (!Number.isSafeInteger(value)) throw new Error("Invalid payment amount");
    return fromPaise(BigInt(value));
}

export const positiveMoneySchema = z.coerce
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, "Enter an amount with up to two decimal places")
    .transform((value) => {
        const [rupees, paise = ""] = value.split(".");
        return `${rupees}.${paise.padEnd(2, "0")}`;
    })
    .refine((value) => toPaise(value) > BigInt(0), "Amount must be greater than 0");
