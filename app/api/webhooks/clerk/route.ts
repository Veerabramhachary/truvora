import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { expenses } from "@/db/schema/expenses";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import { featureUsage } from "@/db/schema/feature-usage";
import { paymentInvoices } from "@/db/schema/appInvoices";
import { paymentTransactions } from "@/db/schema/appTransactions";

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
            await db.transaction(async (tx) => {
                await tx
                    .insert(users)
                    .values({
                        id,
                        email: primaryEmail,
                        firstName: first_name,
                        imageUrl: image_url,
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: users.id,
                        set: {
                            email: primaryEmail,
                            firstName: first_name,
                            imageUrl: image_url,
                            updatedAt: new Date(),
                        },
                    });

                const existingSubscription = await tx
                    .select({ id: app_subscriptions.id })
                    .from(app_subscriptions)
                    .where(eq(app_subscriptions.userId, id))
                    .limit(1);

                if (existingSubscription.length > 0) return;

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
                    return;
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
            });
        }

        if (eventType === "user.deleted") {
            const { id } = evt.data;
            if (id) {
                await db.transaction(async (tx) => {
                    const billingSubs = await tx.select({ id: app_subscriptions.id }).from(app_subscriptions).where(eq(app_subscriptions.userId, id));
                    const billingIds = billingSubs.map((row) => row.id);
                    if (billingIds.length) {
                        // Retain aggregate billing facts, but sever customer,
                        // subscription, and provider references and remove invoice details.
                        await tx.update(paymentTransactions).set({ subscriptionsId: null, invoiceId: null, idempotencyKey: null, providerTransactionId: null, metadata: null, errorMessage: null }).where(eq(paymentTransactions.subscriptionsId, billingIds[0]));
                        for (const billingId of billingIds.slice(1)) await tx.update(paymentTransactions).set({ subscriptionsId: null, invoiceId: null, idempotencyKey: null, providerTransactionId: null, metadata: null, errorMessage: null }).where(eq(paymentTransactions.subscriptionsId, billingId));
                        await tx.update(paymentInvoices).set({ subscriptionId: null, providerInvoiceId: null, invoiceNumber: null, lines: null, metadata: null }).where(eq(paymentInvoices.subscriptionId, billingIds[0]));
                        for (const billingId of billingIds.slice(1)) await tx.update(paymentInvoices).set({ subscriptionId: null, providerInvoiceId: null, invoiceNumber: null, lines: null, metadata: null }).where(eq(paymentInvoices.subscriptionId, billingId));
                    }
                    await tx.delete(expenses).where(eq(expenses.userId, id));
                    await tx.delete(transactions).where(eq(transactions.userId, id));
                    await tx.delete(subscriptions).where(eq(subscriptions.userId, id));
                    await tx.delete(featureUsage).where(eq(featureUsage.userId, id));
                    await tx.delete(categories).where(eq(categories.userId, id));
                    await tx.delete(app_subscriptions).where(eq(app_subscriptions.userId, id));
                    await tx.delete(users).where(eq(users.id, id));
                });
            }
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
