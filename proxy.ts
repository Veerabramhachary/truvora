import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkRateLimits, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";

// Public routes (marketing pages)
const isPublicRoute = createRouteMatcher([
    "/",
    "/pricing",
    "/privacy-policy",
    "/terms",
    "/auth/sign-in(.*)",
    "/auth/signout(.*)",
    "/auth/sign-up(.*)",
    "/auth/verify-email(.*)",
    "/sso-callback(.*)",
    "/api/webhooks/clerk(.*)",
    "/api/webhooks/stripe(.*)",
    "/api/plans(.*)",
    "/api/stripe/prices(.*)",
    // Cron routes authenticate with the CRON_SECRET bearer token instead of a
    // Clerk session, so they must be reachable without a signed-in user.
    "/api/crons/(.*)",
]);

/*
  There is no separate "dashboard" list here on purpose. The marketing and
  auth routes above return early as public, and `/api/*` returns above them
  too — so every request reaching the bottom is private by definition, and a
  missing session is the only reason to bounce.

  An earlier `isDashboardRoute(request) || !userId` version redirected
  *authenticated* users away from /dashboard on every visit; Clerk then saw an
  existing session on its sign-in page and sent them straight back to
  /dashboard, producing an endless loop that parked on the hosted sign-in page.
*/

// API routes
const isApiRoute = createRouteMatcher(["/api/(.*)"]);
const APP_ORIGIN = new URL(SITE_URL).origin;

function hasAllowedOrigin(request: NextRequest): boolean {
    const origin = request.headers.get("origin");
    if (!origin) return true; // Server-to-server callers and webhooks.

    try {
        return new URL(origin).origin === APP_ORIGIN;
    } catch {
        return false;
    }
}

/*
  Same-origin guard for state-changing API requests.

  Clerk's session cookie is SameSite=Lax, so this is defence in depth rather
  than the only barrier — it also catches HTML form posts and survives any
  future cookie loosening. Requests carrying neither `Sec-Fetch-Site` nor
  `Origin` (curl, server-to-server, the cron) are allowed through, because only
  a browser can attach the session cookie to a cross-site request.

  Webhooks and crons never reach this: they're public and return at step 1.
*/
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSameOrigin(request: NextRequest): boolean {
    const site = request.headers.get("sec-fetch-site");
    if (site) return site === "same-origin";

    const origin = request.headers.get("origin");
    if (!origin) return true;

    const host = request.headers.get("host");
    if (!host) return false;

    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

export async function proxy(req: NextRequest, evt: NextFetchEvent) {
    return clerkMiddleware(async (auth, request) => {
        const { userId, redirectToSignIn } = await auth();

        // Enforce the canonical app origin for browser API requests, including
        // read-only routes. Originless server-to-server requests remain valid.
        if (isApiRoute(request) && !hasAllowedOrigin(request)) {
            return new NextResponse("Cross-origin request rejected", { status: 403 });
        }

        if (isApiRoute(request) && request.method === "OPTIONS") {
            return new NextResponse(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": APP_ORIGIN,
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    Vary: "Origin",
                },
            });
        }

        // 1️⃣ Allow public routes immediately
        if (isPublicRoute(request)) {
            const pathname = request.nextUrl.pathname;
            if (pathname === "/api/plans" || pathname === "/api/stripe/prices") {
                const result = await checkRateLimits(`ip:${getClientIp(request)}`, ["public"]);
                if (result && !result.allowed) {
                    return NextResponse.json(
                        { error: "Too many requests. Please try again later." },
                        { status: 429, headers: rateLimitHeaders(result) },
                    );
                }
            }
            return NextResponse.next();
        }

        // 2️⃣ Handle API route protection (Return 401 instead of redirect)
        if (isApiRoute(request)) {
            if (MUTATING_METHODS.has(request.method) && !isSameOrigin(request)) {
                return new NextResponse("Cross-origin request rejected", {
                    status: 403,
                });
            }
            if (!userId) {
                return new NextResponse("Unauthorized", { status: 401 });
            }
            const result = await checkRateLimits(`user:${userId}`, ["api"]);
            if (result && !result.allowed) {
                return NextResponse.json(
                    { error: "Too many requests. Please try again later." },
                    { status: 429, headers: rateLimitHeaders(result) },
                );
            }
            return NextResponse.next();
        }

        // 3️⃣ Private routes: bounce only when there's genuinely no session.
        if (!userId) {
            return redirectToSignIn();
        }

        return NextResponse.next();
    })(req, evt);
}

export const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
    ],
};
