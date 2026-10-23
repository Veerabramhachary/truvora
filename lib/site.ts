/**
 * Single source of truth for the production origin.
 *
 * Used by the root metadata, sitemap and robots so they can't disagree. Set
 * `NEXT_PUBLIC_APP_URL` to the real domain before launch — the localhost
 * fallback is only for local development and would produce a useless sitemap.
 */
export const SITE_URL =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const SITE_NAME = "Truvora";

export const SITE_DESCRIPTION =
    "Track expenses, income and subscriptions in one place — with recurring-charge alerts before they hit your card.";
