import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
    class TestCancellationError extends Error {
        status: number;
        code: string;
        preview?: unknown;

        constructor(
            message: string,
            status: number,
            code: string,
            preview?: unknown,
        ) {
            super(message);
            this.status = status;
            this.code = code;
            this.preview = preview;
        }
    }

    return {
        enabled: true,
        limited: false,
        userId: "user_1" as string | null,
        preview: {
            eligible: true,
            planName: "Pro",
            periodEnd: "2026-12-01T00:00:00.000Z",
            currency: "INR",
            paid: "1000.00",
            alreadyRefunded: "0.00",
            refundAmount: "500.00",
            kind: "prorated" as const,
            reason: null,
            explanation: "Refund for 15 days unused of 30 days.",
        },
        result: {
            refundId: "refund-row-1",
            providerRefundId: "rfnd_1",
            amount: "500.00",
            currency: "INR",
            status: "pending",
            planEnded: true,
        },
        error: null as Error | null,
        TestCancellationError,
    };
});

vi.mock("@clerk/nextjs/server", () => ({
    auth: vi.fn(async () => ({ userId: mocks.userId })),
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimits: vi.fn(async () =>
        mocks.limited
            ? {
                  allowed: false,
                  limit: 5,
                  remaining: 0,
                  reset: Date.now() + 60_000,
                  retryAfter: 60,
              }
            : null,
    ),
    rateLimitResponse: (result: { allowed: boolean } | null) =>
        result && !result.allowed
            ? new Response(JSON.stringify({ error: "Too many requests." }), {
                  status: 429,
                  headers: { "content-type": "application/json" },
              })
            : null,
}));

vi.mock("@/lib/refund-service", () => ({
    CANCEL_REASONS: [
        "too_expensive",
        "not_using",
        "missing_feature",
        "other",
    ],
    CancellationError: mocks.TestCancellationError,
    isBillingRefundsEnabled: () => mocks.enabled,
    getCancellationPreview: vi.fn(async () => mocks.preview),
    cancelNow: vi.fn(async () => {
        if (mocks.error) throw mocks.error;
        return mocks.result;
    }),
}));

import { GET, POST } from "@/app/api/billing/cancellation/route";

const post = (body: unknown = { expectedRefund: "500.00" }) =>
    POST(
        new NextRequest("http://localhost/api/billing/cancellation", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
    );

beforeEach(() => {
    mocks.enabled = true;
    mocks.limited = false;
    mocks.userId = "user_1";
    mocks.error = null;
});

describe("cancellation route", () => {
    it("is 401 without a signed-in user", async () => {
        mocks.userId = null;

        expect((await GET()).status).toBe(401);
        expect((await post()).status).toBe(401);
    });

    it("returns the preview", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            eligible: true,
            refundAmount: "500.00",
        });
    });

    it("is 404 when refunds are switched off", async () => {
        mocks.enabled = false;

        expect((await GET()).status).toBe(404);
        expect((await post()).status).toBe(404);
    });

    it("rejects an invalid body without calling the refund service", async () => {
        const response = await post({ expectedRefund: "lots" });

        expect(response.status).toBe(400);
    });

    it("rate limits a user who submits too often", async () => {
        mocks.limited = true;

        expect((await post()).status).toBe(429);
    });

    it("returns the refund details on success", async () => {
        const response = await post();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            ...mocks.result,
        });
    });

    it("returns a stale preview with 409 so the dialog can re-confirm", async () => {
        mocks.error = new mocks.TestCancellationError(
            "The refund amount changed. Review and confirm again.",
            409,
            "stale_amount",
            mocks.preview,
        );

        const response = await post();
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body).toMatchObject({
            error: "The refund amount changed. Review and confirm again.",
            code: "stale_amount",
            preview: { refundAmount: "500.00" },
        });
    });

    it("hides unexpected failures behind a 500", async () => {
        mocks.error = new Error("database details");
        vi.spyOn(console, "error").mockImplementation(() => {});

        const response = await post();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: "Internal server error",
        });
    });
});
