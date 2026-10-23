import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // Everything behind a session: crawlers would only ever see the
            // sign-in redirect, and indexing auth-gated URLs is actively
            // harmful (they surface as "blocked by robots.txt" dead links).
            disallow: ["/dashboard", "/auth", "/api", "/sso-callback"],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
