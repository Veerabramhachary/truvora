import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { paymentOrders } from "@/db/schema/payment-orders";
import { users } from "@/db/schema/users";
import { checkRateLimits, rateLimitResponse } from "@/lib/rate-limit";
import { toPaise } from "@/lib/money";
import {
    buildRazorpayReceipt,
    createRazorpayOrder,
    getRazorpayConfig,
    RazorpayError,
} from "@/lib/razorpay";
import { platformDiscounts } from "@/db/schema/platform-discounts";
import { platformDiscountRedemptions } from "@/db/schema/platform-discount-redemptions";
import { fulfillPaymentOrder } from "@/lib/payment-fulfillment";

export const runtime = "nodejs";

const bodySchema = z
    .object({
        planId: z.string().uuid("planId must be a uuid"),
        /** Opt out of applying the user's reserved platform discount. */
        applyDiscount: z.boolean().optional(),
    })
    .strict();

/**
 * Creates a Razorpay order for the authenticated user.
 *
 * The amount is read from the `plans` table and recomputed here. A caller can
 * choose a plan id, but can never choose a price. The key secret stays on the
 * server; only the publishable key id is returned to the browser.
 *
 * If the user has a pending platform (referral) discount reservation from
 * sign-up, it is applied automatically unless `applyDiscount: false` is sent.
 * A fully-comped (₹0) checkout skips Razorpay entirely and is fulfilled
 * server-side.
 */
export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const limited = rateLimitResponse(
            await checkRateLimits(`user:${userId}:checkout`, ["sensitive"]),
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

        const [plan] = await db
            .select()
            .from(plans)
            .where(
                and(
                    eq(plans.id, parsed.data.planId),
                    eq(plans.isActive, true),
                ),
            )
            .limit(1);

        if (!plan) {
            return NextResponse.json(
                { error: "Plan not found" },
                { status: 404 },
            );
        }

        if (plan.currency.toUpperCase() !== "INR") {
            return NextResponse.json(
                { error: "Only INR plans are available" },
                { status: 400 },
            );
        }

        if (plan.provider !== "none" && plan.provider !== "razorpay") {
            return NextResponse.json(
                { error: "This plan uses a different payment provider." },
                { status: 400 },
            );
        }

        const planPrice = Number(plan.price);
        const shouldApplyDiscount = parsed.data.applyDiscount ?? true;

        // Resolve any pending platform discount reserved for this user at
        // sign-up (one redemption per user total).
        let discountCampaign: typeof platformDiscounts.$inferSelect | null = null;
        let discountAmount = 0;
        let discountedAmount = planPrice;

        if (shouldApplyDiscount) {
            const [redemption] = await db
                .select({
                    id: platformDiscountRedemptions.id,
                    platformDiscountId: platformDiscountRedemptions.platformDiscountId,
                    status: platformDiscountRedemptions.status,
                })
                .from(platformDiscountRedemptions)
                .where(eq(platformDiscountRedemptions.userId, userId))
                .limit(1);

            if (
                redemption &&
                redemption.status === "pending" &&
                redemption.platformDiscountId
            ) {
                const [campaign] = await db
                    .select()
                    .from(platformDiscounts)
                    .where(eq(platformDiscounts.id, redemption.platformDiscountId))
                    .limit(1);

                const now = new Date();
                const campaignValid = Boolean(campaign)
                    && campaign.isActive
                    && (!campaign.startsAt || campaign.startsAt <= now)
                    && (!campaign.endsAt || campaign.endsAt >= now);

                if (campaignValid && campaign) {
                    discountCampaign = campaign;
                    const rawDiscount =
                        campaign.discountType === "percent"
                            ? planPrice * (Number(campaign.discountValue) / 100)
                            : Number(campaign.discountValue);
                    discountAmount = Math.min(Math.max(rawDiscount, 0), planPrice);
                    discountedAmount = planPrice - discountAmount;
                }
            }
        }

        const amountPaise = toPaise(discountedAmount.toFixed(2));
        if (amountPaise < BigInt(100)) {
            // Fully comped or free: skip Razorpay entirely and fulfill
            // server-side. The order row is created locally with a synthetic
            // provider order id so it can be tracked and audited.
            const receipt = buildRazorpayReceipt();
            const providerOrderId = `free_${crypto.randomUUID()}`;

            const [order] = await db
                .insert(paymentOrders)
                .values({
                    userId,
                    planId: plan.id,
                    provider: "razorpay",
                    providerOrderId,
                    receipt,
                    amount: discountedAmount.toFixed(2),
                    currency: plan.currency.toUpperCase(),
                    status: "created",
                    ...(discountCampaign ? { discountId: discountCampaign.id } : {}),
                    ...(discountAmount > 0 ? { discountAmount: discountAmount.toFixed(2) } : {}),
                    discountCurrency: plan.currency.toUpperCase(),
                    notes: { planId: plan.id, ...(discountCampaign ? { discountApplied: "true" } : {}) },
                })
                .returning();

            await fulfillPaymentOrder({
                providerOrderId: order.providerOrderId,
                currency: order.currency,
                // No amountPaise: ₹0 checkout has no Razorpay payment to match.
            });

            // Mark the redemption consumed.
            if (discountCampaign) {
                await db
                    .update(platformDiscountRedemptions)
                    .set({ status: "completed", redeemedAt: new Date() })
                    .where(
                        and(
                            eq(
                                platformDiscountRedemptions.platformDiscountId,
                                discountCampaign.id,
                            ),
                            eq(platformDiscountRedemptions.userId, userId),
                            eq(platformDiscountRedemptions.status, "pending"),
                        ),
                    );
            }

            return NextResponse.json({
                success: true,
                skipRazorpay: true,
                amount: "0.00",
                currency: plan.currency.toUpperCase(),
                planName: plan.name,
                planInterval: plan.interval,
                planIntervalCount: plan.intervalCount,
                discountApplied: Boolean(discountCampaign),
                discountAmount: discountCampaign
                    ? discountAmount.toFixed(2)
                    : "0.00",
            });
        }

        if (amountPaise > BigInt(Number.MAX_SAFE_INTEGER)) {
            return NextResponse.json(
                { error: "Plan price is invalid" },
                { status: 400 },
            );
        }

        const [current] = await db
            .select({
                planId: app_subscriptions.planId,
                status: app_subscriptions.status,
                currentPeriodEnd: app_subscriptions.currentPeriodEnd,
            })
            .from(app_subscriptions)
            .where(
                and(
                    eq(app_subscriptions.userId, userId),
                    inArray(app_subscriptions.status, ["active", "trialing"]),
                ),
            )
            .limit(1);

        if (
            current?.planId === plan.id &&
            current.currentPeriodEnd.getTime() > Date.now()
        ) {
            return NextResponse.json(
                { error: "You are already on this plan." },
                { status: 409 },
            );
        }

        const [profile] = await db
            .select({ firstName: users.firstName, email: users.email })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        const receipt = buildRazorpayReceipt();
        const order = await createRazorpayOrder(
            {
                amountPaise: Number(amountPaise),
                receipt,
                notes: { planId: plan.id },
            },
            config,
        );

        // Never hand the browser an order whose amount differs from the
        // (possibly discounted) amount we computed server-side.
        const expectedAmountPaise = toPaise(discountedAmount.toFixed(2));
        if (
            !Number.isSafeInteger(order.amount) ||
            BigInt(order.amount) !== expectedAmountPaise ||
            order.currency.toUpperCase() !== "INR"
        ) {
            console.error("[razorpay] Order amount/currency mismatch", {
                orderId: order.id,
                expectedAmount: Number(expectedAmountPaise),
                receivedAmount: order.amount,
                receivedCurrency: order.currency,
            });
            return NextResponse.json(
                { error: "Could not start checkout. Please try again." },
                { status: 502 },
            );
        }

        await db.insert(paymentOrders).values({
            userId,
            planId: plan.id,
            provider: "razorpay",
            providerOrderId: order.id,
            receipt,
            amount: discountedAmount.toFixed(2),
            currency: plan.currency.toUpperCase(),
            status: "created",
            ...(discountCampaign ? { discountId: discountCampaign.id } : {}),
            ...(discountAmount > 0 ? { discountAmount: discountAmount.toFixed(2) } : {}),
            discountCurrency: plan.currency.toUpperCase(),
            notes: { planId: plan.id, ...(discountCampaign ? { discountApplied: "true" } : {}) },
        });

        return NextResponse.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: config.keyId,
            planName: plan.name,
            planInterval: plan.interval,
            planIntervalCount: plan.intervalCount,
            prefill: {
                name: profile?.firstName ?? "",
                email: profile?.email ?? "",
            },
            discountApplied: Boolean(discountCampaign),
            discountAmount: discountCampaign
                ? discountAmount.toFixed(2)
                : "0.00",
            originalAmount: planPrice.toFixed(2),
        });
    } catch (error) {
        if (error instanceof RazorpayError) {
            console.error("[razorpay] Could not create order:", error.message);
            return NextResponse.json(
                { error: "Could not start checkout. Please try again." },
                { status: 502 },
            );
        }
        console.error("Razorpay order creation failed:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
