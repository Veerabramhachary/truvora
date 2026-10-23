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
        {
            url: `${SITE_URL}/pricing`,
            lastModified: now,
            changeFrequency: "monthly",
            priority: 0.9,
        },
        {
            url: `${SITE_URL}/terms`,
            lastModified: now,
            changeFrequency: "yearly",
            priority: 0.3,
        },
        {
            url: `${SITE_URL}/privacy-policy`,
            lastModified: now,
            changeFrequency: "yearly",
            priority: 0.3,
        },
    ];
}
