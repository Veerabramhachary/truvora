import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimits, rateLimitResponse } from "@/lib/rate-limit";
import {
    CANCEL_REASONS,
    CancellationError,
    cancelNow,
    getCancellationPreview,
    isBillingRefundsEnabled,
} from "@/lib/refund-service";

export const runtime = "nodejs";

const bodySchema = z
    .object({
        expectedRefund: z
            .string()
            .trim()
            .regex(
                /^\d{1,8}(?:\.\d{1,2})?$/,
                "expectedRefund must be a rupee amount",
            ),
        reason: z.enum(CANCEL_REASONS).optional(),
    })
    .strict();

/** Preview for the cancel dialog. Read-only and owner-scoped. */
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isBillingRefundsEnabled()) {
        return NextResponse.json(
            { error: "Cancellation is not available." },
            { status: 404 },
        );
    }

    const preview = await getCancellationPreview(userId);
    return NextResponse.json(preview);
}

/** Cancel now and refund the unused time. */
export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isBillingRefundsEnabled()) {
        return NextResponse.json(
            { error: "Cancellation is not available." },
            { status: 404 },
        );
    }

    const limited = rateLimitResponse(
        await checkRateLimits(`user:${userId}:cancel`, ["sensitive"]),
    );
    if (limited) return limited;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request body" },
            { status: 400 },
        );
    }

    try {
        const result = await cancelNow({
            userId,
            expectedRefund: parsed.data.expectedRefund,
            reason: parsed.data.reason ?? null,
        });
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        if (error instanceof CancellationError) {
            return NextResponse.json(
                {
                    error: error.message,
                    code: error.code,
                    ...(error.preview ? { preview: error.preview } : {}),
                },
                { status: error.status },
            );
        }

        console.error("Cancellation failed:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
