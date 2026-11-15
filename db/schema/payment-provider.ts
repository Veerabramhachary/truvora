import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Lives in its own module: `payment-orders.ts` needs it eagerly at table
 * construction, and importing it from `plans.ts` made the two files a circular
 * import that failed during `drizzle-kit generate`.
 */
export const paymentProviderEnum = pgEnum("payment_provider", [
    "paypal",
    "braintree",
    "razorpay",
    "none",
]);
