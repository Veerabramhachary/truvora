import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Constant-time string comparison. Both values are hashed first so the two
 * buffers always have the same length (`timingSafeEqual` throws otherwise, and
 * comparing lengths directly would leak the secret's length).
 */
export function safeEqual(a: string, b: string): boolean {
    const digest = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(digest(a), digest(b));
}

/**
 * Shared guard for the `/api/crons/*` routes. Fails closed: 503 when
 * `CRON_SECRET` is not configured, 401 when the bearer token does not match.
 * Returns `null` when the request is authorised, otherwise the response to
 * send back.
 */
export function authorizeCron(request: Request): NextResponse | null {
    const secret = process.env.CRON_SECRET;
    if (!secret) return new NextResponse("Cron is not configured", { status: 503 });

    const header = request.headers.get("authorization") ?? "";
    if (!safeEqual(header, `Bearer ${secret}`)) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    return null;
}
