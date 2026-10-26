import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";

type RateLimitPolicy = "api" | "export" | "sensitive" | "public";

type PolicyDefinition = {
    id: RateLimitPolicy;
    requests: number;
    window: "1 m" | "1 h" | "1 d";
};

type RateLimitResult = {
    allowed: boolean;
    limit: number;
    remaining: number;
    reset: number;
    retryAfter: number;
};

const policies: Record<RateLimitPolicy, PolicyDefinition[]> = {
    api: [
        { id: "api", requests: 100, window: "1 m" },
        { id: "api", requests: 5_000, window: "1 d" },
    ],
    export: [
        { id: "export", requests: 5, window: "1 m" },
        { id: "export", requests: 50, window: "1 d" },
    ],
    sensitive: [{ id: "sensitive", requests: 5, window: "1 h" }],
    public: [
        { id: "public", requests: 60, window: "1 m" },
        { id: "public", requests: 1_000, window: "1 d" },
    ],
};

let redis: Redis | null = null;
let configurationWarningLogged = false;
let unavailableWarningLogged = false;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        if (!configurationWarningLogged) {
            console.error("[rate-limit] Upstash Redis is not configured; rate limits are bypassed.");
            configurationWarningLogged = true;
        }
        return null;
    }

    redis ??= new Redis({ url, token });
    return redis;
}

function getLimiter(policy: PolicyDefinition): Ratelimit {
    const key = `${policy.id}:${policy.requests}:${policy.window}`;
    const cached = limiters.get(key);
    if (cached) return cached;

    const client = getRedis();
    if (!client) throw new Error("Rate limit Redis is not configured");

    const limiter = new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(policy.requests, policy.window),
        prefix: `truvora:rate-limit:${policy.id}:${policy.requests}:${policy.window}`,
        analytics: false,
    });
    limiters.set(key, limiter);
    return limiter;
}

export async function checkRateLimits(
    subject: string,
    selectedPolicies: RateLimitPolicy[],
): Promise<RateLimitResult | null> {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
        getRedis();
        return null;
    }

    try {
        let result: RateLimitResult | null = null;
        for (const policyId of selectedPolicies) {
            for (const policy of policies[policyId]) {
                const current = await getLimiter(policy).limit(subject);
                const candidate: RateLimitResult = {
                    allowed: current.success,
                    limit: current.limit,
                    remaining: current.remaining,
                    reset: current.reset,
                    retryAfter: Math.max(1, Math.ceil((current.reset - Date.now()) / 1_000)),
                };
                if (!result || candidate.remaining < result.remaining) result = candidate;
                if (!current.success) return candidate;
            }
        }
        return result;
    } catch (error) {
        if (!unavailableWarningLogged) {
            console.error("[rate-limit] Redis request failed; allowing requests until it recovers.", error);
            unavailableWarningLogged = true;
        }
        return null;
    }
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
    return {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.reset / 1_000)),
        ...(result.allowed ? {} : { "Retry-After": String(result.retryAfter) }),
    };
}

export function rateLimitResponse(result: RateLimitResult | null): NextResponse | null {
    if (!result || result.allowed) return null;
    return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: rateLimitHeaders(result) },
    );
}

export function getClientIp(request: Request): string {
    // Vercel supplies x-real-ip at its edge. Do not use the client-controlled
    // X-Forwarded-For header as a fallback because it can be spoofed.
    return request.headers.get("x-real-ip")?.trim() || "unknown";
}
