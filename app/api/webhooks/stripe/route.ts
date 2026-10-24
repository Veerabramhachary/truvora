import { db } from "@/db";
import { paymentInvoices } from "@/db/schema/appInvoices";
import { paymentTransactions } from "@/db/schema/appTransactions";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { users } from "@/db/schema/users";
import { getStripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { fromMinorUnits } from "@/lib/money";

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

export async function POST(req: NextRequest) {
    const buf = await req.text();
    const sig = req.headers.get("stripe-signature")!;

    let event: Stripe.Event;

    try {
        event = getStripe().webhooks.constructEvent(
            buf,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!,
        );
    } catch (err: unknown) {
        const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json(
            { error: `Webhook Error: ${errorMessage}` },
            { status: 400 },
        );
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
        case "checkout.session.completed":
            await handleCheckoutCompleted(
                event.data.object as Stripe.Checkout.Session,
            );
            break;
        default:
            console.warn(`Unhandled event type ${event.type}`);
    }
    return NextResponse.json({ received: true });
}

/**
 * Links the Stripe customer created during checkout back onto the local user.
 *
 * `client_reference_id` is set by `/api/stripe/checkout` to the Clerk user id.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.client_reference_id ?? session.metadata?.userId;
    const customerId =
        typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

    if (!userId || !customerId) {
        console.warn(
            `Checkout session ${session.id} is missing a user id or customer id`,
        );
        return;
    }

    await linkStripeCustomer(userId, customerId);
}

async function linkStripeCustomer(userId: string, customerId: string) {
    const updated = await db
        .update(users)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id });

    if (updated.length === 0) {
        console.warn(
            `No local user ${userId} to attach Stripe customer ${customerId} to`,
        );
    }
}

async function handleInvoicePaid(invoice: ExpandedInvoice) {
    const subscriptionId =
        typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

    if (!subscriptionId) return;

    await db.transaction(async (tx) => {
        const [sub] = await tx
            .select()
            .from(app_subscriptions)
            .where(eq(app_subscriptions.providerSubscriptionId, subscriptionId));

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
                providerInvoiceId: invoice.id,
                invoiceNumber: invoice.number ?? `INV-${Date.now()}`,
                amountDue: fromMinorUnits(invoice.amount_due),
                amountPaid: fromMinorUnits(invoice.amount_paid),
                currency: invoice.currency,
                status: mapStripeInvoiceStatus(invoice.status),
                paidAt: invoice.status_transitions?.paid_at
                    ? new Date(invoice.status_transitions.paid_at * 1000)
                    : new Date(),
                lines: invoice.lines.data.map((line) => ({
                    description: line.description ?? "No description",
                    amount: Number(fromMinorUnits(line.amount)),
                })),
            })
            .onConflictDoUpdate({
                target: paymentInvoices.providerInvoiceId,
                set: {
                    status: "paid",
                    amountPaid: fromMinorUnits(invoice.amount_paid),
                },
            })
            .returning();

        await tx
            .insert(paymentTransactions)
            .values({
                subscriptionsId: sub.id,
                invoiceId: localInvoice.id,
                type: "payment",
                amount: fromMinorUnits(invoice.amount_paid),
                currency: invoice.currency,
                status: "succeeded",
                providerTransactionId: chargeId,
                // The key must be unique per outcome: `invoice.paid` and
                // `invoice.payment_failed` share `invoice.id`, so a single key
                // made the second insert violate the unique constraint.
                idempotencyKey: `${invoice.id}:paid`,
            })
            .onConflictDoNothing();
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
        .where(eq(app_subscriptions.providerSubscriptionId, subscriptionId));

    if (!subscription) return;

    const status = mapStripeInvoiceStatus(invoice.status);

    const [localInvoice] = await db
        .insert(paymentInvoices)
        .values({
            subscriptionId: subscription.id,
            providerInvoiceId: invoice.id,
            invoiceNumber: invoice.number ?? `INV-${Date.now()}`,
            amountDue: fromMinorUnits(invoice.amount_due),
            amountPaid: fromMinorUnits(invoice.amount_paid),
            currency: invoice.currency,
            status: status,
            lines: invoice.lines.data.map((line) => ({
                description: line.description ?? "No description",
                amount: Number(fromMinorUnits(line.amount)),
                period: line.period
                    ? {
                          start: new Date(line.period.start * 1000),
                          end: new Date(line.period.end * 1000),
                      }
                    : undefined,
            })),
        })
        .onConflictDoUpdate({
            target: paymentInvoices.providerInvoiceId,
            set: { status: status, updatedAt: new Date() },
        })
        .returning();

    const chargeId =
        typeof invoice.charge === "string"
            ? invoice.charge
            : invoice.charge?.id;

    if (chargeId) {
        await db
            .insert(paymentTransactions)
            .values({
                subscriptionsId: subscription.id,
                invoiceId: localInvoice.id,
                type: "payment",
                amount: fromMinorUnits(invoice.amount_due),
                currency: invoice.currency,
                status: "failed",
                providerTransactionId: chargeId,
                // Distinct from the `invoice.paid` key for the same invoice.
                idempotencyKey: `${invoice.id}:failed`,
            })
            .onConflictDoNothing();
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

    const localPlanId = await getLocalPlanFromStripePriceId(item.price.id);

    // The checkout flow stamps the Clerk user id onto the subscription. Use it
    // to link the Stripe customer when we don't have a mapping yet.
    const metadataUserId = subscription.metadata?.userId;
    if (metadataUserId) {
        await linkStripeCustomer(metadataUserId, customerId);
    }

    const userId = await getLocalUserIdFromStripeCustomerId(customerId);

    if (!localPlanId || !userId) return;

    const subWithPeriods = subscription as SubscriptionWithPeriods;

    const data = {
        userId,
        planId: localPlanId,
        provider: "stripe" as const,
        providerSubscriptionId: subscription.id,
        status: mapSubscriptionStatus(subscription.status),
        currentPeriodStart: new Date(
            subWithPeriods.current_period_start * 1000,
        ),
        currentPeriodEnd: new Date(subWithPeriods.current_period_end * 1000),
        cancelAtPeriodEnd: subWithPeriods.cancel_at_period_end,
        planSnapshot: {
            name: item.price.nickname || item.plan?.nickname || "Plan",
            price: (item.price.unit_amount || 0) / 100,
            currency: item.price.currency,
            interval: item.price.recurring?.interval ?? "month",
            intervalCount: item.price.recurring?.interval_count || 1,
        },
        updatedAt: new Date(),
    };

    await db
        .insert(app_subscriptions)
        .values(data)
        .onConflictDoUpdate({
            target: app_subscriptions.providerSubscriptionId,
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
        .where(eq(app_subscriptions.providerSubscriptionId, subscription.id));
}


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
        .where(eq(plans.providerPlanId, id))
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
