// middleware.ts
import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale, localePrefix, pathnames } from "@/i18n/config";

export default createMiddleware({
    locales,
    defaultLocale,
    localePrefix,
    pathnames,
    localeDetection: true,
    alternateLinks: true,
});

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|_vercel|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)",
        "/",
        "/(en|fr|es|de)/:path*",
    ],
};
