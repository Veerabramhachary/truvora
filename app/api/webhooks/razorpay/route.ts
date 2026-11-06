import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import {
    fulfillPaymentOrder,
    PaymentFulfillmentError,
    recordPaymentFailure,
} from "@/lib/payment-fulfillment";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 100_000;

const paymentEntitySchema = z
    .object({
        id: z.string().min(1).max(100),
        order_id: z.string().min(1).max(100).optional().nullable(),
        amount: z.number().int().nonnegative(),
        currency: z.string().min(1).max(10),
        status: z.string().optional(),
        error_description: z.string().max(500).optional().nullable(),
    })
    .passthrough();

const orderEntitySchema = z
    .object({
        id: z.string().min(1).max(100),
        amount: z.number().int().nonnegative(),
        currency: z.string().min(1).max(10),
        status: z.string().optional(),
    })
    .passthrough();

const webhookSchema = z
    .object({
        event: z.string().min(1).max(100),
        payload: z
            .object({
                payment: z
                    .object({ entity: paymentEntitySchema })
                    .optional(),
                order: z.object({ entity: orderEntitySchema }).optional(),
            })
            .optional(),
    })
    .passthrough();

/**
 * Razorpay webhook.
 *
 * Public in `proxy.ts` because Razorpay has no Clerk session. The raw body is
 * verified with the webhook secret; the JSON is parsed only after that check.
 * This route is the durable source of truth if the browser closes before the
 * verify call completes.
 */
export async function POST(request: NextRequest) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
    if (!secret) {
        return NextResponse.json(
            { error: "Webhook is not configured" },
            { status: 503 },
        );
    }

    const signature = request.headers.get("x-razorpay-signature")?.trim();
    if (!signature) {
        return NextResponse.json(
            { error: "Missing signature" },
            { status: 400 },
        );
    }

    // Signature is over the exact bytes Razorpay sent. Re-serialising the
    // parsed object would change whitespace and break every delivery.
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
        return NextResponse.json(
            { error: "Payload too large" },
            { status: 413 },
        );
    }

    if (
        !verifyRazorpayWebhookSignature({
            rawBody,
            signature,
            secret,
        })
    ) {
        console.error("[razorpay] Webhook signature verification failed");
        return NextResponse.json(
            { error: "Invalid signature" },
            { status: 400 },
        );
    }

    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = webhookSchema.safeParse(parsedJson);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid webhook payload" },
            { status: 400 },
        );
    }

    const event = parsed.data;
    const payment = event.payload?.payment?.entity;
    const order = event.payload?.order?.entity;

    try {
        if (event.event === "payment.captured" || event.event === "order.paid") {
            const providerOrderId = payment?.order_id ?? order?.id;
            if (!providerOrderId) {
                return NextResponse.json({ received: true, ignored: true });
            }

            const result = await fulfillPaymentOrder({
                providerOrderId,
                providerPaymentId: payment?.id ?? null,
                amountPaise: payment?.amount ?? order?.amount ?? null,
                currency: payment?.currency ?? order?.currency ?? null,
            });

            return NextResponse.json({
                received: true,
                alreadyProcessed: result.alreadyProcessed,
            });
        }

        if (event.event === "payment.failed") {
            const providerOrderId = payment?.order_id;
            if (providerOrderId) {
                await recordPaymentFailure({
                    providerOrderId,
                    reason: payment?.error_description ?? null,
                });
            }
            return NextResponse.json({ received: true });
        }

        // Acknowledge unsubscribed events so Razorpay does not retry them.
        return NextResponse.json({ received: true, ignored: true });
    } catch (error) {
        if (error instanceof PaymentFulfillmentError) {
            // Invalid amounts / inactive plans are not recoverable by a retry.
            // Log and acknowledge so a real payment is investigated manually
            // instead of disappearing into an endless retry loop.
            console.error("[razorpay] Webhook could not fulfil order:", {
                event: event.event,
                orderId: order?.id ?? payment?.order_id,
                reason: error.message,
                status: error.status,
            });
            return NextResponse.json({ received: true, unfulfilled: true });
        }

        // Unknown failures return 500 so Razorpay retries a transient issue.
        console.error("[razorpay] Webhook processing failed:", error);
        return NextResponse.json(
            { error: "Webhook processing failed" },
            { status: 500 },
        );
    }
}
