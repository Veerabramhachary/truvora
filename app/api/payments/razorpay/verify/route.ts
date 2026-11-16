import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { paymentOrders } from "@/db/schema/payment-orders";
import { checkRateLimits, rateLimitResponse } from "@/lib/rate-limit";
import { toPaise } from "@/lib/money";
import {
    captureRazorpayPayment,
    fetchRazorpayPayment,
    getRazorpayConfig,
    RazorpayError,
    verifyRazorpayPaymentSignature,
} from "@/lib/razorpay";
import {
    fulfillPaymentOrder,
    PaymentFulfillmentError,
    recordPaymentFailure,
} from "@/lib/payment-fulfillment";
import { getBillingState } from "@/lib/billing-state";
import { refundUnfulfilledPayment } from "@/lib/unfulfilled-payment-refund";

export const runtime = "nodejs";

const bodySchema = z
    .object({
        orderId: z.string().trim().min(1).max(100),
        paymentId: z.string().trim().min(1).max(100),
        signature: z.string().trim().min(1).max(256),
    })
    .strict();

/**
 * Verifies the browser return value and grants the plan.
 *
 * The signature proves Razorpay authorised this order/payment pair, but the
 * payment is also re-fetched from Razorpay so the amount, currency and status
 * are checked server-side. The webhook is the durable backup if this request
 * never reaches us.
 */
export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const limited = rateLimitResponse(
            await checkRateLimits(`user:${userId}:checkout-verify`, ["sensitive"]),
        );
        if (limited) return limited;

        const config = getRazorpayConfig();
        if (!config) {
            return NextResponse.json(
                { error: "Payments are not configured yet." },
                { status: 503 },
            );
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 },
            );
        }

        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }

        const { orderId, paymentId, signature } = parsed.data;

        if (
            !verifyRazorpayPaymentSignature({
                orderId,
                paymentId,
                signature,
                secret: config.keySecret,
            })
        ) {
            return NextResponse.json(
                { error: "Payment could not be verified." },
                { status: 400 },
            );
        }

        // Ownership is checked here, not just in the browser. Another user's
        // order id cannot be used to upgrade this account.
        const [order] = await db
            .select()
            .from(paymentOrders)
            .where(
                and(
                    eq(paymentOrders.providerOrderId, orderId),
                    eq(paymentOrders.userId, userId),
                ),
            )
            .limit(1);

        if (!order) {
            return NextResponse.json(
                { error: "Payment order not found." },
                { status: 404 },
            );
        }

        if (order.status === "paid") {
            return NextResponse.json({ success: true, alreadyProcessed: true });
        }

        if (order.provider !== "razorpay") {
            return NextResponse.json(
                { error: "Payment order is not a Razorpay order." },
                { status: 400 },
            );
        }

        let payment = await fetchRazorpayPayment(paymentId, config);

        if (payment.order_id !== orderId) {
            return NextResponse.json(
                { error: "Payment does not belong to this order." },
                { status: 400 },
            );
        }

        if (
            !Number.isSafeInteger(payment.amount) ||
            BigInt(payment.amount) !== toPaise(order.amount)
        ) {
            return NextResponse.json(
                { error: "Payment amount does not match the order." },
                { status: 400 },
            );
        }

        if (payment.currency.toUpperCase() !== order.currency.toUpperCase()) {
            return NextResponse.json(
                { error: "Payment currency does not match the order." },
                { status: 400 },
            );
        }

        // Razorpay accounts that do not auto-capture return `authorized`.
        // Reject conflicting plan changes before capture so we never take money
        // for an order that cannot be fulfilled without replacing an active paid
        // period. If already captured, fulfillment is the durable check.
        if (payment.status === "authorized") {
            const billing = await getBillingState(order.userId);
            if (
                billing.status === "paid" &&
                billing.plan?.id &&
                billing.plan.id !== order.planId
            ) {
                await recordPaymentFailure({
                    providerOrderId: order.providerOrderId,
                    reason:
                        "Payment not captured: active paid plan conflicts with this order.",
                });
                return NextResponse.json(
                    {
                        error:
                            "This payment cannot be completed because another paid plan is active. The payment was not captured.",
                    },
                    { status: 409 },
                );
            }

            payment = await captureRazorpayPayment(
                paymentId,
                payment.amount,
                config,
            );
        }

        if (payment.status !== "captured") {
            return NextResponse.json(
                { error: "Payment is not complete yet." },
                { status: 409 },
            );
        }

        try {
            await fulfillPaymentOrder({
                providerOrderId: order.providerOrderId,
                providerPaymentId: payment.id,
                amountPaise: payment.amount,
                currency: payment.currency,
            });
        } catch (error) {
            if (
                error instanceof PaymentFulfillmentError &&
                error.status === 409
            ) {
                await recordPaymentFailure({
                    providerOrderId: order.providerOrderId,
                    reason: error.message,
                });

                // R-03: Razorpay already captured this payment, so give the money
                // back instead of leaving the customer charged with no plan.
                const refund = await refundUnfulfilledPayment({
                    providerOrderId: order.providerOrderId,
                    providerPaymentId: payment.id,
                    amountPaise: payment.amount,
                    reason: "unfulfillable",
                });
                const refundStarted =
                    refund.outcome === "refund_started" ||
                    refund.outcome === "pending_retry" ||
                    (refund.outcome === "skipped" &&
                        refund.reason === "already_refunding");

                return NextResponse.json(
                    {
                        error: refundStarted
                            ? "This payment could not be applied to your account, so we started a full refund. It normally arrives in 5-7 working days."
                            : error.message,
                        refundStarted,
                    },
                    { status: 409 },
                );
            }
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof PaymentFulfillmentError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.status },
            );
        }
        if (error instanceof RazorpayError) {
            console.error("[razorpay] Payment verification failed:", error.message);
            return NextResponse.json(
                { error: "Could not verify the payment. Please try again." },
                { status: 502 },
            );
        }
        console.error("Razorpay payment verification failed:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
