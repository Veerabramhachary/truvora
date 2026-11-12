import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { asc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { Resend } from "resend";
import { WelcomeEmail } from "@/components/welcome-email";
import { SITE_URL } from "@/lib/site";
import { platformDiscounts } from "@/db/schema/platform-discounts";
import { platformDiscountRedemptions } from "@/db/schema/platform-discount-redemptions";
import { markWebhookDeletion } from "@/lib/account-deletion";
import { accountDeletions } from "@/db/schema/account-deletions";
import { ledgers } from "@/db/schema/ledgers";

export async function POST(req: NextRequest) {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
        throw new Error(
            "Please add CLERK_WEBHOOK_SECRET from the Clerk Dashboard to .env",
        );
    }

    const headerPayLoad = await headers();
    const svixId = headerPayLoad.get("svix-id");
    const svixTimestamp = headerPayLoad.get("svix-timestamp");
    const svixSignature = headerPayLoad.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
        return new Response("Error: Missing Svix headers", { status: 400 });
    }

    // Svix signs the exact bytes it sent. Re-parsing with `.json()` and
    // re-serialising can reorder keys or alter whitespace, which changes the
    // signature and makes `verify` reject every legitimately signed request.
    // The catch then swallowed it, so sign-ups silently never reached the DB.
    const body = await req.text();

    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: WebhookEvent;

    try {
        evt = wh.verify(body, {
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
        }) as WebhookEvent;
    } catch (error) {
        console.error("Error verifying webhook", error);
        return NextResponse.json({ error: "Error verifying webhook" }, { status: 400 });
    }

    const eventType = evt.type;
    try {
        if (eventType === "user.created" || eventType === "user.updated") {
            const { id, email_addresses, first_name, image_url } = evt.data;
            const unsafeMetadata = "unsafe_metadata" in evt.data
                ? evt.data.unsafe_metadata as Record<string, unknown> | null
                : null;
            const referralPlatform = typeof unsafeMetadata?.referralPlatform === "string"
                ? unsafeMetadata.referralPlatform.trim().toLowerCase().slice(0, 64)
                : null;
            const [campaign] = referralPlatform ? await db
                .select({
                    id: platformDiscounts.id,
                    isActive: platformDiscounts.isActive,
                    startsAt: platformDiscounts.startsAt,
                    endsAt: platformDiscounts.endsAt,
                    maxRedemptions: platformDiscounts.maxRedemptions,
                    discountType: platformDiscounts.discountType,
                    discountValue: platformDiscounts.discountValue,
                })
                .from(platformDiscounts)
                .where(eq(platformDiscounts.platform, referralPlatform))
                .limit(1) : [];

            const now = new Date();
            const campaignValid = Boolean(campaign)
                && campaign.isActive
                && (!campaign.startsAt || campaign.startsAt <= now)
                && (!campaign.endsAt || campaign.endsAt >= now);

            // Narrowed reference so TypeScript knows `campaign` is defined
            // when `campaignValid` is true.
            const validCampaign = campaignValid ? campaign : null;

            // Attribution is best-effort: a bad or expired `ref` must never
            // block sign-up. Log it so ops can see attribution leakage.
            if (referralPlatform && !campaign) {
                console.warn(
                    `[clerk-webhook] No campaign for ref "${referralPlatform}" (user ${id})`,
                );
            } else if (referralPlatform && campaign && !campaignValid) {
                console.warn(
                    `[clerk-webhook] Campaign for ref "${referralPlatform}" is inactive or outside its date window (user ${id})`,
                );
            }

            const primaryEmail =
                email_addresses.find(
                    (e) => e.id === evt.data.primary_email_address_id,
                )?.email_address || email_addresses[0]?.email_address;

            if (!primaryEmail) {
                return NextResponse.json(
                    { error: "No primary email found" },
                    { status: 400 },
                );
            }

            /*
              Both writes in one transaction, and the plan is looked up rather
              than hardcoded.

              Two failures used to hide here. `planId` was a hardcoded UUID,
              but `plans.id` is `defaultRandom()` and nothing seeds the plans
              table, so the FK almost always failed. And with no transaction,
              a failed subscription insert still left the user row behind —
              half a sign-up. userId also references users.id, so the user has
              to land first within the same transaction.
            */
            const shouldSendWelcome = await db.transaction(async (tx) => {
                await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
                const [deletion] = await tx
                    .select({ clerkUserId: accountDeletions.clerkUserId })
                    .from(accountDeletions)
                    .where(eq(accountDeletions.clerkUserId, id))
                    .limit(1);
                if (deletion) return false;

                await tx
                    .insert(users)
                    .values({
                        id,
                        email: primaryEmail,
                        firstName: first_name,
                        imageUrl: image_url,
                        ...(eventType === "user.created" && referralPlatform ? { referralPlatform } : {}),
                        ...(eventType === "user.created" && validCampaign ? { platformDiscountId: validCampaign.id } : {}),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: users.id,
                        set: {
                            email: primaryEmail,
                            firstName: first_name,
                            imageUrl: image_url,
                            ...(eventType === "user.created" && referralPlatform ? { referralPlatform } : {}),
                            ...(eventType === "user.created" && validCampaign ? { platformDiscountId: validCampaign.id } : {}),
                            updatedAt: new Date(),
                        },
                    });

                // Reserve the discount for this new user (one redemption per
                // user total). Status stays `pending` until checkout applies it
                // (Phase 2). Max redemptions is enforced here too.
                if (
                    eventType === "user.created"
                    && validCampaign
                    && validCampaign.maxRedemptions !== null
                ) {
                    const [existingRedemption] = await tx
                        .select({ id: platformDiscountRedemptions.id })
                        .from(platformDiscountRedemptions)
                        .where(eq(platformDiscountRedemptions.userId, id))
                        .limit(1);
                    if (!existingRedemption) {
                        const [usedCount] = await tx
                            .select({
                                count: sql<number>`count(*)::int`,
                            })
                            .from(platformDiscountRedemptions)
                            .where(
                                eq(
                                    platformDiscountRedemptions.platformDiscountId,
                                    validCampaign.id,
                                ),
                            );
                        const used = usedCount?.count ?? 0;
                        if (used < validCampaign.maxRedemptions) {
                            await tx.insert(platformDiscountRedemptions).values({
                                platformDiscountId: validCampaign.id,
                                userId: id,
                                status: "pending",
                            });
                        } else {
                            // Campaign exhausted: clear the stamped discount so
                            // the user is not promised something unavailable.
                            await tx
                                .update(users)
                                .set({ platformDiscountId: null })
                                .where(eq(users.id, id));
                            console.warn(
                                `[clerk-webhook] Campaign for ref "${referralPlatform}" exhausted (max ${validCampaign.maxRedemptions}); user ${id} not granted`,
                            );
                        }
                    }
                }

                // Every user owns exactly one personal ledger. The step-1
                // backfill covered pre-rollout users; this covers everyone
                // from here on, so `02_verify`'s "users without personal
                // ledger" stays 0 and every ledger-scoped insert can resolve
                // its ledger_id (NOT NULL from step 4). Inserted on `tx` (not
                // via getOrCreatePersonalLedger, which uses the pooled db)
                // so it stays part of this transaction; the partial unique
                // index absorbs webhook re-deliveries and concurrent races.
                await tx
                    .insert(ledgers)
                    .values({ ownerUserId: id, type: "personal", name: "Personal" })
                    .onConflictDoNothing();

                const existingSubscription = await tx
                    .select({ id: app_subscriptions.id })
                    .from(app_subscriptions)
                    .where(eq(app_subscriptions.userId, id))
                    .limit(1);

                if (existingSubscription.length > 0) return true;

                // Free tier = cheapest active plan. `price` is a numeric
                // column, so Drizzle orders it numerically despite returning
                // it as a string.
                const [defaultPlan] = await tx
                    .select({ id: plans.id })
                    .from(plans)
                    .where(eq(plans.isActive, true))
                    .orderBy(asc(plans.price))
                    .limit(1);

                // planId is nullable by design. An empty plans table must not
                // block the user row — otherwise the dashboard sees no account
                // at all instead of an account awaiting a plan.
                if (!defaultPlan) {
                    console.warn(
                        "[clerk-webhook] No active plan found; created user %s without a subscription row.",
                        id,
                    );
                    return true;
                }

                const now = new Date();
                const farFuture = new Date();
                farFuture.setFullYear(now.getFullYear() + 100);

                await tx.insert(app_subscriptions).values({
                    userId: id,
                    planId: defaultPlan.id,
                    status: "active",
                    provider: "none",
                    currentPeriodStart: now,
                    currentPeriodEnd: farFuture,
                    cancelAtPeriodEnd: false,
                    createdAt: now,
                    updatedAt: now,
                });
                return true;
            });

            // Clerk emits user.created after either email verification or
            // successful OAuth registration. Keeping this on the shared
            // webhook path covers both signup methods; retries use a stable
            // idempotency key so they don't send duplicate welcome emails.
            if (eventType === "user.created" && shouldSendWelcome) {
                try {
                    const resendKey = process.env.RESEND_API_KEY;
                    const sender = process.env.RENEWAL_EMAIL_FROM;
                    if (!resendKey || !sender) {
                        throw new Error("Welcome email is not configured");
                    }

                    const resend = new Resend(resendKey);
                    const result = await resend.emails.send(
                        {
                            from: sender,
                            to: primaryEmail,
                            subject: "Welcome to Truvora",
                            react: WelcomeEmail({
                                firstName: first_name || "there",
                                dashboardUrl: `${SITE_URL}/dashboard`,
                            }),
                        },
                        { idempotencyKey: `welcome/${id}` },
                    );
                    if (result.error) {
                        throw new Error(`Welcome email send failed: ${result.error.name}`);
                    }
                } catch (error) {
                    console.error("[clerk-webhook] Failed to send welcome email:", error);
                }
            }
        }

        if (eventType === "user.deleted") {
            const { id } = evt.data;
            if (id) await markWebhookDeletion(id);
        }
    } catch (error) {
        // Logged, and 500 rather than 400 so Clerk retries a transient
        // failure. The old silent 400 is exactly what hid this: an unlogged
        // failure looks identical to a webhook that was never configured.
        console.error(
            `[clerk-webhook] Failed to process ${eventType}:`,
            error,
        );
        return NextResponse.json(
            { error: "Error processing event" },
            { status: 500 },
        );
    }

    return NextResponse.json({ success: true });
}
