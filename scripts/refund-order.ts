/**
 * Ops tool: refund a paid Razorpay order.
 *
 *   npx tsx scripts/refund-order.ts --order <provider_order_id>            # dry run
 *   npx tsx scripts/refund-order.ts --order <provider_order_id> --apply    # full refund
 *   npx tsx scripts/refund-order.ts --order <provider_order_id> --amount 25.00 --apply
 *
 * Dry run (the default) only reads the database. `--apply` calls Razorpay and
 * moves money. A full refund of the order that funds the current period also
 * ends the plan, exactly like a dashboard refund.
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { paymentOrders } from "@/db/schema/payment-orders";
import { paymentRefunds } from "@/db/schema/payment-refunds";
import { app_subscriptions } from "@/db/schema/plans";
import { fromPaise, toPaise } from "@/lib/money";
import {
    createRazorpayRefund,
    getRazorpayConfig,
    RazorpayError,
} from "@/lib/razorpay";
import {
    applyProviderRefund,
    refundStatusFromProvider,
} from "@/lib/refund-fulfillment";

const APPLY = process.argv.includes("--apply");

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Rupees string → `NUMERIC(10,2)` string, rejecting sub-paise values. */
function parseAmount(value: string): string {
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) {
        throw new Error("--amount must be rupees with up to two decimals");
    }
    const [rupees, paise = ""] = value.split(".");
    return `${rupees}.${paise.padEnd(2, "0")}`;
}

async function main() {
    const amountIndex = process.argv.indexOf("--amount");
    if (amountIndex >= 0 && !process.argv[amountIndex + 1]) {
        throw new Error("--amount needs a rupee value, e.g. --amount 25.00");
    }

    const providerOrderId = arg("--order");
    if (!providerOrderId) {
        throw new Error(
            "Usage: tsx scripts/refund-order.ts --order <provider_order_id> [--amount 12.34] [--apply]",
        );
    }

    const [order] = await db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.providerOrderId, providerOrderId))
        .limit(1);

    if (!order) throw new Error("Order not found");

    const refundable = toPaise(order.amountPaid) - toPaise(order.amountRefunded);
    const requested = arg("--amount")
        ? toPaise(parseAmount(arg("--amount") as string))
        : refundable;

    console.log(
        `Order ${order.providerOrderId}: status=${order.status}, ` +
            `paid=${order.amountPaid} ${order.currency}, ` +
            `already refunded=${order.amountRefunded}, refundable=${fromPaise(refundable)}, ` +
            `payment=${order.providerPaymentId ?? "none"}.`,
    );
    console.log(`Refund: ${fromPaise(requested)} ${order.currency} (normal speed).`);

    if (order.status !== "paid") throw new Error("Only a paid order can be refunded");
    if (!order.providerPaymentId) throw new Error("Order has no provider payment id");
    if (refundable <= 0) throw new Error("Nothing left to refund");
    if (requested <= 0 || requested > refundable) {
        throw new Error(`Refund must be between 0.01 and ${fromPaise(refundable)}`);
    }

    const [active] = await db
        .select({ id: paymentRefunds.id, status: paymentRefunds.status })
        .from(paymentRefunds)
        .where(
            and(
                eq(paymentRefunds.paymentOrderId, order.id),
                inArray(paymentRefunds.status, [
                    "requested",
                    "pending",
                    "processed",
                ]),
                ne(paymentRefunds.kind, "external"),
            ),
        )
        .limit(1);
    if (active) {
        throw new Error(`A refund for this order is already ${active.status}`);
    }

    if (!APPLY) {
        console.log("Dry run: no changes. Re-run with --apply to refund.");
        return;
    }

    const config = getRazorpayConfig();
    if (!config) throw new Error("Razorpay is not configured");

    const [subscription] = await db
        .select({ id: app_subscriptions.id })
        .from(app_subscriptions)
        .where(eq(app_subscriptions.userId, order.userId))
        .orderBy(desc(app_subscriptions.currentPeriodEnd))
        .limit(1);

    const kind =
        requested === toPaise(order.amountPaid) ? "full_window" : "prorated";

    const [row] = await db
        .insert(paymentRefunds)
        .values({
            paymentOrderId: order.id,
            userId: order.userId,
            appSubscriptionId: subscription?.id ?? null,
            kind,
            status: "requested",
            amount: fromPaise(requested),
            currency: order.currency,
            speedRequested: "normal",
            requestedBy: "ops",
            calc: {
                source: "scripts/refund-order",
                amountPaise: Number(requested),
            },
        })
        .returning({ id: paymentRefunds.id });

    let providerRefund;
    try {
        providerRefund = await createRazorpayRefund(
            {
                paymentId: order.providerPaymentId,
                amountPaise: Number(requested),
                // Razorpay requires 10+ characters of letters/digits/`-`/`_`.
                idempotencyKey: `rfnd-${row.id}`,
                notes: { refundId: row.id, orderId: order.providerOrderId },
                speed: "normal",
            },
            config,
        );
    } catch (error) {
        if (error instanceof RazorpayError && !error.retryable) {
            await db
                .update(paymentRefunds)
                .set({
                    status: "failed",
                    errorCode: error.code,
                    updatedAt: new Date(),
                })
                .where(eq(paymentRefunds.id, row.id));
        }
        // A retryable failure leaves the row `requested`; the same idempotency
        // key makes a re-run safe, and the refund webhook can finish it first.
        throw error;
    }

    const result = await applyProviderRefund({
        providerPaymentId: order.providerPaymentId,
        providerRefundId: providerRefund.id,
        amountPaise: providerRefund.amount,
        currency: providerRefund.currency ?? order.currency,
        status: refundStatusFromProvider(providerRefund.status),
        refundId: row.id,
        requestedBy: "ops",
        kind,
        speedRequested: "normal",
    });

    console.log(
        `Refund ${providerRefund.id}: provider status=${providerRefund.status}, ` +
            `applied=${result.applied}, endedPlan=${result.endedPlan}` +
            `${result.reason ? `, reason=${result.reason}` : ""}.`,
    );
    if (!result.applied && result.reason === "pending") {
        console.log(
            "Refund is pending at Razorpay; the refund.processed webhook will apply it.",
        );
    }
}

main()
    .then(closeDb)
    .catch(async (error) => {
        console.error("Refund failed:", error);
        await closeDb();
        process.exitCode = 1;
    });
