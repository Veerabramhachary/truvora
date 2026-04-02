import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public routes (marketing pages)
const isPublicRoute = createRouteMatcher([
    "/",
    "/(en|ar)",
    "/(en|ar)/pricing",
    "/auth/sign-in(.*)",
    "/auth/sign-up(.*)",
    "/auth/verify-email(.*)",
    "/sso-callback(.*)",
    "/api/webhooks/clerk(.*)",
    "/api/plans(.*)",
]);

// Protected dashboard routes
const isDashboardRoute = createRouteMatcher([
    "/(en|ar)/(.*)"
]);

// Admin-only routes

// API routes
const isApiRoute = createRouteMatcher(["/api/(.*)"]);

export async function proxy(req: any, evt: any) {
    return clerkMiddleware(async (auth, request) => {
        const { userId, redirectToSignIn } = await auth();

        // 1️⃣ Allow public routes immediately
        if (isPublicRoute(request)) {
            return NextResponse.next();
        }

        // 2️⃣ Handle API route protection (Return 401 instead of redirect)
        if (isApiRoute(request)) {
            if (!userId) {
                return new NextResponse("Unauthorized", { status: 401 });
            }
            return NextResponse.next();
        }

        // 3️⃣ Protect Dashboard & All other private routes
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
