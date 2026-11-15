import { describe, expect, it, vi } from "vitest";

/**
 * B-09: an order stays `status = 'paid'` after a refund (the refund is tracked
 * on `amount_refunded` and `payment_refunds`). A replayed `payment.captured`
 * webhook must therefore be a no-op, or a refunded customer would get the plan
 * back. The guard is the paid-status check, so a fully refunded order is enough
 * to exercise it.
 */
const dbMock = vi.hoisted(() => {
    let queue: unknown[][] = [];
    const updates: unknown[] = [];
    const inserts: unknown[] = [];

    const chain = () => {
        const result: Record<string, unknown> = {
            from: () => result,
            where: () => result,
            limit: () => result,
            for: () => result,
            then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
                Promise.resolve(queue.shift() ?? []).then(resolve, reject),
        };
        return result;
    };

    const tx = {
        select: vi.fn(() => chain()),
        update: vi.fn(() => ({
            set: (values: unknown) => {
                updates.push(values);
                return { where: async () => undefined };
            },
        })),
        insert: vi.fn(() => ({
            values: (values: unknown) => {
                inserts.push(values);
                const conflict = {
                    returning: async () => [{ id: "invoice-1" }],
                    then: (
                        resolve: (value: unknown) => unknown,
                        reject: (reason: unknown) => unknown,
                    ) => Promise.resolve(undefined).then(resolve, reject),
                };
                return {
                    returning: async () => [{ id: "subscription-1" }],
                    onConflictDoNothing: () => conflict,
                };
            },
        })),
        execute: vi.fn(async () => undefined),
    };

    return {
        updates,
        inserts,
        tx,
        setQueue: (next: unknown[][]) => {
            queue = next;
        },
        reset: () => {
            queue = [];
            updates.length = 0;
            inserts.length = 0;
        },
    };
});

vi.mock("@/db", () => ({
    db: { transaction: (fn: (tx: unknown) => unknown) => fn(dbMock.tx) },
}));

import { fulfillPaymentOrder } from "@/lib/payment-fulfillment";

const order = {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-refunded",
    planId: "00000000-0000-4000-8000-000000000002",
    provider: "razorpay",
    providerOrderId: "order_refunded",
    providerPaymentId: "pay_refunded",
    receipt: "trv_test",
    amount: "129.00",
    amountPaid: "129.00",
    amountRefunded: "129.00",
    periodStart: new Date("2026-11-01T00:00:00.000Z"),
    periodEnd: new Date("2026-12-01T00:00:00.000Z"),
    currency: "INR",
    discountId: null,
    discountAmount: null,
    discountCurrency: null,
    status: "paid",
    notes: null,
    failureReason: null,
    paidAt: new Date("2026-11-01T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    updatedAt: new Date("2026-11-01T00:00:00.000Z"),
};

describe("fulfillPaymentOrder", () => {
    it("does not re-grant a plan when a paid order is replayed after a refund", async () => {
        dbMock.reset();
        dbMock.setQueue([
            [{ userId: order.userId }],
            [order],
            [{ name: "Starter" }],
        ]);

        const result = await fulfillPaymentOrder({
            providerOrderId: order.providerOrderId,
            providerPaymentId: order.providerPaymentId,
            amountPaise: 12900,
            currency: "INR",
        });

        expect(result).toEqual({
            alreadyProcessed: true,
            planName: "Starter",
        });
        // No subscription write, no invoice, no payment row: nothing to undo.
        expect(dbMock.updates).toHaveLength(0);
        expect(dbMock.inserts).toHaveLength(0);
    });
});
