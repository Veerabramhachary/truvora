import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { paymentOrders } from "@/db/schema/payment-orders";
import { paymentRefunds } from "@/db/schema/payment-refunds";
import { plans } from "@/db/schema/plans";

export type PaymentHistoryRefund = {
    id: string;
    amount: string;
    currency: string;
    status: string;
    kind: string;
    createdAt: Date;
    processedAt: Date | null;
};

export type PaymentHistoryOrder = {
    id: string;
    planName: string | null;
    amountPaid: string;
    amountRefunded: string;
    currency: string;
    paidAt: Date | null;
    createdAt: Date;
    refunds: PaymentHistoryRefund[];
};

/**
 * Payment history for one user. Only paid orders are shown: a failed checkout
 * never took money, and the refund rows hang off the order. Every query is
 * scoped by `userId`; nothing comes from the client.
 */
export async function getPaymentHistory(
    userId: string,
    limit = 50,
): Promise<PaymentHistoryOrder[]> {
    const orders = await db
        .select({
            id: paymentOrders.id,
            planName: plans.name,
            amountPaid: paymentOrders.amountPaid,
            amountRefunded: paymentOrders.amountRefunded,
            currency: paymentOrders.currency,
            paidAt: paymentOrders.paidAt,
            createdAt: paymentOrders.createdAt,
        })
        .from(paymentOrders)
        .leftJoin(plans, eq(paymentOrders.planId, plans.id))
        .where(
            and(
                eq(paymentOrders.userId, userId),
                eq(paymentOrders.status, "paid"),
            ),
        )
        .orderBy(desc(paymentOrders.createdAt))
        .limit(limit);

    if (orders.length === 0) return [];

    const refunds = await db
        .select({
            id: paymentRefunds.id,
            paymentOrderId: paymentRefunds.paymentOrderId,
            amount: paymentRefunds.amount,
            currency: paymentRefunds.currency,
            status: paymentRefunds.status,
            kind: paymentRefunds.kind,
            createdAt: paymentRefunds.createdAt,
            processedAt: paymentRefunds.processedAt,
        })
        .from(paymentRefunds)
        .where(
            and(
                eq(paymentRefunds.userId, userId),
                inArray(
                    paymentRefunds.paymentOrderId,
                    orders.map((order) => order.id),
                ),
            ),
        )
        .orderBy(desc(paymentRefunds.createdAt));

    const byOrder = new Map<string, PaymentHistoryRefund[]>();
    for (const refund of refunds) {
        const list = byOrder.get(refund.paymentOrderId) ?? [];
        list.push({
            id: refund.id,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status,
            kind: refund.kind,
            createdAt: refund.createdAt,
            processedAt: refund.processedAt,
        });
        byOrder.set(refund.paymentOrderId, list);
    }

    return orders.map((order) => ({
        ...order,
        refunds: byOrder.get(order.id) ?? [],
    }));
}
