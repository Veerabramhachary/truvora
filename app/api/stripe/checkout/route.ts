import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { plans } from "@/db/schema/plans";
import { users } from "@/db/schema/users";
import { getStripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toPaise } from "@/lib/money";
import { checkRateLimits, rateLimitResponse } from "@/lib/rate-limit";
import {
    attachCheckoutSession,
    reservePlatformDiscount,
    updatePlatformDiscountRedemption,
} from "@/lib/platform-discounts";

const bodySchema = z.object({
    planId: z.string().uuid("planId must be a uuid"),
});

function arePaymentsEnabled() {
    return false;
}

/**
 * Creates a Stripe Checkout session for a local plan.
 *
 * The Clerk user id is carried on the session (`client_reference_id` and
 * `metadata`) so the `checkout.session.completed` webhook can map the Stripe
 * customer back onto the local user.
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

        // Paid checkout is intentionally unavailable until Truvora begins
        // accepting payments. Keep this server-side guard so a direct API call
        // cannot create a Stripe Checkout session while the pricing CTA is off.
        if (!arePaymentsEnabled()) {
            return NextResponse.json(
                { error: "Payments are not available yet" },
                { status: 503 },
            );
        }

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }

        const [plan] = await db
            .select()
            .from(plans)
            .where(eq(plans.id, parsed.data.planId));

        if (!plan) {
            return NextResponse.json({ error: "Plan not found" }, { status: 404 });
        }
        if (!plan.isActive) {
            return NextResponse.json(
                { error: "Plan is not available" },
                { status: 400 },
            );
        }
        if (!plan.providerPlanId) {
            return NextResponse.json(
                { error: "Plan is not available for purchase" },
                { status: 400 },
            );
        }
        if (plan.currency !== "INR") {
            return NextResponse.json(
                { error: "Only INR plans are available" },
                { status: 400 },
            );
        }
        const stripePrice = await getStripe().prices.retrieve(plan.providerPlanId);
        if (
            !stripePrice.active ||
            stripePrice.currency.toUpperCase() !== "INR" ||
            stripePrice.unit_amount === null ||
            BigInt(stripePrice.unit_amount) !== toPaise(plan.price)
        ) {
            console.error("Stripe price does not match the INR plan configuration", plan.id);
            return NextResponse.json(
                { error: "Plan payment configuration is unavailable" },
                { status: 503 },
            );
        }

        // Make sure the local user row exists before checkout, so the webhook
        // can always attach the Stripe customer to it.
        const clerkUser = await currentUser();
        const email =
            clerkUser?.primaryEmailAddress?.emailAddress ??
            clerkUser?.emailAddresses[0]?.emailAddress;

        const [existingUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (!existingUser) {
            if (!email) {
                return NextResponse.json(
                    { error: "No email address on file" },
                    { status: 400 },
                );
            }
            await db.insert(users).values({
                id: userId,
                email,
                firstName: clerkUser?.firstName ?? null,
                imageUrl: clerkUser?.imageUrl ?? null,
            });
        }

        const origin = request.headers.get("origin") ?? request.nextUrl.origin;
        const reservation = await reservePlatformDiscount(userId);
        const metadata = {
            userId,
            planId: plan.id,
            ...(reservation ? { discountRedemptionId: reservation.id } : {}),
        };

        let session: Awaited<
            ReturnType<ReturnType<typeof getStripe>["checkout"]["sessions"]["create"]>
        >;
        try {
            session = await getStripe().checkout.sessions.create({
                mode: "subscription",
                line_items: [{ price: plan.providerPlanId, quantity: 1 }],
                // Reuse the existing Stripe customer so we never create duplicates.
                ...(existingUser?.stripeCustomerId
                    ? { customer: existingUser.stripeCustomerId }
                    : { customer_email: email }),
                ...(reservation
                    ? { discounts: [{ coupon: reservation.couponId }] }
                    : {}),
                client_reference_id: userId,
                metadata,
                subscription_data: { metadata },
                success_url: `${origin}/?checkout=success`,
                cancel_url: `${origin}/?checkout=cancelled`,
            });
        } catch (error) {
            if (reservation) {
                await updatePlatformDiscountRedemption(
                    reservation.id,
                    null,
                    "released",
                );
            }
            throw error;
        }

        if (reservation) {
            await attachCheckoutSession(reservation.id, session.id);
        }

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error("Checkout session creation error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
