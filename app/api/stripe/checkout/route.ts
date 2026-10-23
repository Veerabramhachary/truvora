import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { plans } from "@/db/schema/plans";
import { users } from "@/db/schema/users";
import { getStripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
    planId: z.string().uuid("planId must be a uuid"),
});

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
        const metadata = { userId, planId: plan.id };

        const session = await getStripe().checkout.sessions.create({
            mode: "subscription",
            line_items: [{ price: plan.providerPlanId, quantity: 1 }],
            // Reuse the existing Stripe customer so we never create duplicates.
            ...(existingUser?.stripeCustomerId
                ? { customer: existingUser.stripeCustomerId }
                : { customer_email: email }),
            client_reference_id: userId,
            metadata,
            subscription_data: { metadata },
            success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/?checkout=cancelled`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error("Checkout session creation error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
