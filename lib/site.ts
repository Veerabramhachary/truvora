/**
 * Single source of truth for the public origin.
 *
 * Prefer the explicit canonical URL. On Vercel, fall back to the active
 * deployment hostname so previews and the initial Vercel subdomain don't
 * produce localhost metadata or sitemap URLs. Set NEXT_PUBLIC_APP_URL when a
 * stable custom domain is connected.
 */
const configuredSiteUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
const vercelHost = process.env.VERCEL_URL?.trim();

export const SITE_URL = configuredSiteUrl ||
    (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");

export const SITE_NAME = "Truvora";

export const SITE_DESCRIPTION =
    "Track expenses, income and subscriptions in one place — with recurring-charge alerts before they hit your card.";
