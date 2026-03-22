import { db } from "@/db";
import { paymentInvoices } from "@/db/schema/appInvoices";
import { paymentTransactions } from "@/db/schema/appTransactions";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { users } from "@/db/schema/users";
import { stripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

type ExpandedInvoice = Stripe.Invoice & {
    subscription: Stripe.Subscription | string;
    charge: Stripe.Charge | string;
};

type ExpandedSubscription = Stripe.Subscription & {
    customer: Stripe.Customer | string;
};

type SubscriptionWithPeriods = Stripe.Subscription & {
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
};

export async function POST(req: Request) {
    const buf = await req.text();
    const sig = req.headers.get("stripe-signature")!;

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            buf,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!,
        );
    } catch (err: unknown) {
        const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
        return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
    }

    switch (event.type) {
        case "invoice.paid":
            await handleInvoicePaid(event.data.object as ExpandedInvoice);
            break;
        case "invoice.payment_failed":
            await handleInvoicePaymentFailed(
                event.data.object as ExpandedInvoice,
            );
            break;
        case "customer.subscription.updated":
        case "customer.subscription.created":
            await handleSubscriptionUpsert(
                event.data.object as ExpandedSubscription,
            );
            break;
        case "customer.subscription.deleted":
            await handleSubscriptionDeleted(
                event.data.object as ExpandedSubscription,
            );
            break;
        default:
            console.warn(`Unhandled event type ${event.type}`);
    }
    return new Response(null, { status: 200 });
}

async function handleInvoicePaid(invoice: ExpandedInvoice) {
    const subscriptionId =
        typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

    if (!subscriptionId) return;

    if (!subscriptionId) return;

    await db.transaction(async (tx) => {
        const [sub] = await tx
            .select()
            .from(app_subscriptions)
            .where(eq(app_subscriptions.stripeSubscriptionId, subscriptionId));

        if (!sub) {
            throw new Error(
                `Subscription ${subscriptionId} not found for paid invoice`,
            );
        }

        const chargeId =
            typeof invoice.charge === "string"
                ? invoice.charge
                : (invoice.charge?.id ?? "no_charge");

        const [localInvoice] = await tx
            .insert(paymentInvoices)
            .values({
                subscriptionId: sub.id,
                stripeInvoiceId: invoice.id,
                invoiceNumber: invoice.number ?? `INV-${Date.now()}`,
                amountDue: (invoice.amount_due / 100).toFixed(2),
                amountPaid: (invoice.amount_paid / 100).toFixed(2),
                currency: invoice.currency,
                status: mapStripeInvoiceStatus(invoice.status),
                paidAt: invoice.status_transitions?.paid_at
                    ? new Date(invoice.status_transitions.paid_at * 1000)
                    : new Date(),
                lines: invoice.lines.data.map((line) => ({
                    description: line.description ?? "No description",
                    amount: line.amount / 100,
                })),
            })
            .onConflictDoUpdate({
                target: paymentInvoices.stripeInvoiceId,
                set: {
                    status: "paid",
                    amountPaid: (invoice.amount_paid / 100).toFixed(2),
                },
            })
            .returning();

        await tx.insert(paymentTransactions).values({
            subscriptionsId: sub.id, // Adjust if needed (e.g., subscriptionsId)
            invoiceId: localInvoice.id,
            type: "payment",
            amount: (invoice.amount_paid / 100).toFixed(2),
            currency: invoice.currency,
            status: "succeeded",
            providerTransactionId: chargeId,
            idemptencyKey: invoice.id, // Adjust if needed (e.g., idempotency_key)
        });
    });
}

async function handleInvoicePaymentFailed(invoice: ExpandedInvoice) {
    const subscriptionId =
        typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

    if (!subscriptionId) return;

    const [subscription] = await db
        .select()
        .from(app_subscriptions)
        .where(eq(app_subscriptions.stripeSubscriptionId, subscriptionId));

    if (!subscription) return;

    const status = mapStripeInvoiceStatus(invoice.status);

    const [localInvoice] = await db
        .insert(paymentInvoices)
        .values({
            subscriptionId: subscription.id,
            stripeInvoiceId: invoice.id,
            invoiceNumber: invoice.number ?? `INV-${Date.now()}`,
            amountDue: (invoice.amount_due / 100).toFixed(2),
            amountPaid: (invoice.amount_paid / 100).toFixed(2),
            currency: invoice.currency,
            status: status,
            lines: invoice.lines.data.map((line) => ({
                description: line.description ?? "No description",
                amount: line.amount / 100,
                period: line.period
                    ? {
                          start: new Date(line.period.start * 1000),
                          end: new Date(line.period.end * 1000),
                      }
                    : undefined,
            })),
        })
        .onConflictDoUpdate({
            target: paymentInvoices.stripeInvoiceId,
            set: { status: status, updatedAt: new Date() },
        })
        .returning();

    const chargeId =
        typeof invoice.charge === "string"
            ? invoice.charge
            : invoice.charge?.id;

    if (chargeId) {
        // ⚠️ VERIFY YOUR DATABASE COLUMN NAMES (same as above)
        await db.insert(paymentTransactions).values({
            subscriptionsId: subscription.id, // Adjust as needed
            invoiceId: localInvoice.id,
            type: "payment",
            amount: (invoice.amount_due / 100).toFixed(2),
            currency: invoice.currency,
            status: "failed",
            providerTransactionId: chargeId,
            idemptencyKey: invoice.id, // Adjust as needed
        });
    }
}

async function handleSubscriptionUpsert(
    subscription: Stripe.Subscription & {
        customer: Stripe.Customer | string;
    },
) {
    const customerId =
        typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

    const item = subscription.items.data[0];
    if (!item) return;

    // Check that plan exists (it may be null if the plan was deleted in Stripe)
    if (!item.plan) {
        console.error(`Subscription ${subscription.id} has no plan associated`);
        return;
    }

    const localPlanId = await getLocalPlanFromStripePriceId(item.price.id);
    const userId = await getLocalUserIdFromStripeCustomerId(customerId);

    if (!localPlanId || !userId) return;

    const subWithPeriods = subscription as SubscriptionWithPeriods;

    const data = {
        userId,
        planId: localPlanId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: item.price.id,
        status: mapSubscriptionStatus(subscription.status),
        currentPeriodStart: new Date(
            subWithPeriods.current_period_start * 1000,
        ),
        currentPeriodEnd: new Date(subWithPeriods.current_period_end * 1000),
        cancelAtPeriodEnd: subWithPeriods.cancel_at_period_end,
        planSnapshot: {
            name: item.plan.nickname || "Plan",
            price: (item.plan.amount || 0) / 100,
            currency: item.plan.currency,
            interval: item.plan.interval,
            intervalCount: item.plan.interval_count || 1,
        },
        updatedAt: new Date(),
    };

    await db.insert(app_subscriptions).values(data).onConflictDoUpdate({
        target: app_subscriptions.stripeSubscriptionId,
        set: data,
    });
}

async function handleSubscriptionDeleted(subscription: ExpandedSubscription) {
    await db
        .update(app_subscriptions)
        .set({
            status: "canceled",
            canceledAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(app_subscriptions.stripeSubscriptionId, subscription.id));
}

async function handleCheckoutSession (session: ExpandedSubscription){}

// Helpers
function mapStripeInvoiceStatus(
    status: Stripe.Invoice.Status | null,
): "draft" | "open" | "paid" | "unpaid" | "void" {
    if (!status || status === "uncollectible") return "unpaid";
    return status as "draft" | "open" | "paid" | "unpaid" | "void";
}

function mapSubscriptionStatus(
    status: Stripe.Subscription.Status,
):
    | "active"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "past_due"
    | "trialing"
    | "unpaid" {
    const statusMap: Record<
        Stripe.Subscription.Status,
        | "active"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "past_due"
        | "trialing"
        | "unpaid"
    > = {
        active: "active",
        canceled: "canceled",
        incomplete: "incomplete",
        incomplete_expired: "incomplete_expired",
        past_due: "past_due",
        trialing: "trialing",
        unpaid: "unpaid",
        paused: "active", // Business decision: treat paused as active
    };
    return statusMap[status];
}

async function getLocalPlanFromStripePriceId(id: string) {
    const [plan] = await db
        .select()
        .from(plans)
        .where(eq(plans.stripePriceId, id))
        .limit(1);
    return plan?.id ?? null;
}

async function getLocalUserIdFromStripeCustomerId(id: string) {
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeCustomerId, id))
        .limit(1);
    return user?.id ?? null;
}
