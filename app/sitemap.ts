import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Only the public marketing pages. The dashboard, auth screens and API are
 * session-gated, so listing them would generate URLs crawlers can't reach.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();

    return [
        {
            url: `${SITE_URL}/`,
            lastModified: now,
            changeFrequency: "monthly",
            priority: 1,
        },
        // /pricing, /terms and /privacy-policy moved to the external landing page.
        // Re-add here once the external site URL is known.
    ];
}
