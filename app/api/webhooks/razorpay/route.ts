import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import {
    fulfillPaymentOrder,
    PaymentFulfillmentError,
    recordPaymentFailure,
} from "@/lib/payment-fulfillment";
import { sendRefundFailureAlert } from "@/lib/refund-emails";
import {
    applyProviderRefund,
    refundStatusFromProvider,
} from "@/lib/refund-fulfillment";
import { refundUnfulfilledPayment } from "@/lib/unfulfilled-payment-refund";

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
        /** Auto-refunds of uncaptured payments also arrive as refund events. */
        captured: z.boolean().optional(),
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

const refundEntitySchema = z
    .object({
        id: z.string().min(1).max(100),
        payment_id: z.string().min(1).max(100),
        amount: z.number().int().positive(),
        currency: z.string().min(1).max(10).optional().nullable(),
        status: z.string().min(1).max(30),
        /** Our own refund id or `[]` for dashboard-issued refunds. */
        notes: z.unknown().optional(),
        speed_requested: z.string().max(20).optional().nullable(),
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
                refund: z.object({ entity: refundEntitySchema }).optional(),
            })
            .passthrough()
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
 */export async function POST(request: NextRequest) {
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

        if (
            event.event === "refund.created" ||
            event.event === "refund.processed" ||
            event.event === "refund.failed"
        ) {
            const refund = event.payload?.refund?.entity;
            if (!refund) {
                return NextResponse.json({ received: true, ignored: true });
            }

            // Auto-refunds of uncaptured payments also arrive as refund events.
            // They are not ours to record (§5.8 gap).
            if (payment?.captured === false) {
                console.error(
                    "[razorpay] Ignoring refund webhook for an uncaptured payment:",
                    { event: event.event, refundId: refund.id },
                );
                return NextResponse.json({ received: true, ignored: true });
            }

            const result = await applyProviderRefund({
                providerPaymentId: refund.payment_id,
                providerRefundId: refund.id,
                amountPaise: refund.amount,
                currency: refund.currency ?? payment?.currency ?? null,
                status: refundStatusFromProvider(refund.status),
                notes: refund.notes,
            });

            if (
                !result.applied &&
                result.reason &&
                result.reason !== "already_processed" &&
                result.reason !== "pending" &&
                result.reason !== "failed"
            ) {
                console.error("[razorpay] Refund webhook could not be applied:", {
                    event: event.event,
                    refundId: refund.id,
                    reason: result.reason,
                });
            }
            if (result.reason === "failed" && result.changed) {
                await sendRefundFailureAlert(refund.id);
            }

            return NextResponse.json({
                received: true,
                applied: result.applied,
                endedPlan: result.endedPlan,
            });
        }

        // Acknowledge unsubscribed events (`refund.speed_changed` included) so
        // Razorpay does not retry them.
        return NextResponse.json({ received: true, ignored: true });
    } catch (error) {
        if (error instanceof PaymentFulfillmentError) {
            // Invalid amounts / inactive plans / plan conflicts are not recoverable
            // by a retry. Log and record so a captured-but-unfulfillable payment is
            // durably visible for manual recovery/refund, then acknowledge.
            const providerOrderId = payment?.order_id ?? order?.id;
            if (providerOrderId) {
                await recordPaymentFailure({
                    providerOrderId,
                    reason: error.message,
                });
            }
            console.error("[razorpay] Webhook could not fulfil order:", {
                event: event.event,
                orderId: order?.id ?? payment?.order_id,
                reason: error.message,
                status: error.status,
            });

            // R-03: a payment Razorpay captured but we cannot turn into a plan
            // (plan conflict, withdrawn plan) must not stay charged. Amount and
            // currency mismatches (400) are not refunded automatically: they
            // need a human to look at them.
            if (error.status === 409 && providerOrderId && payment?.id) {
                await refundUnfulfilledPayment({
                    providerOrderId,
                    providerPaymentId: payment.id,
                    amountPaise: payment.amount,
                    reason: "unfulfillable",
                });
            }

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
