import Stripe from "stripe";

/**
 * Lazy Stripe client.
 *
 * `new Stripe(...)` at module scope throws when `STRIPE_SECRET_KEY` is unset,
 * and because the checkout route imported this at the top level, that throw
 * happened during `next build`'s page-data collection — failing the *whole*
 * build rather than just the billing routes. Deferring construction to first
 * use keeps every unrelated route buildable when billing isn't configured yet.
 *
 * Consumers: the checkout route, the prices route, and the Stripe webhook.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe {
    if (client) return client;

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
        throw new Error(
            "STRIPE_SECRET_KEY is not set — billing is unavailable until it is configured.",
        );
    }

    client = new Stripe(apiKey, {
        apiVersion: "2026-02-25.clover",
        typescript: true,
    });
    return client;
}
