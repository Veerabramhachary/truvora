import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards inside `fulfillPaymentOrder` that protect money (audit B-09, R-03):
 *  - a replayed payment.captured for an already paid (or refunded) order is a
 *    no-op and never grants the plan again
 *  - a payment already being refunded cannot activate a plan later
 *  - a payment cannot replace an active paid plan
 */
const dbMock = vi.hoisted(() => {
    let queue: unknown[][] = [];
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];

    const chain = () => {
        const result: Record<string, unknown> = {
            from: () => result,
            where: () => result,
            orderBy: () => result,
            limit: () => result,
            for: () => result,
            then: (
                resolve: (value: unknown) => unknown,
                reject: (reason: unknown) => unknown,
            ) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
        };
        return result;
    };

    const tx = {
        select: vi.fn(() => chain()),
        update: vi.fn(() => ({
            set: (values: Record<string, unknown>) => {
                updates.push(values);
                return { where: async () => undefined };
            },
        })),
        insert: vi.fn(() => ({
            values: (values: Record<string, unknown>) => {
                inserts.push(values);
                return {
                    returning: async () => [{ id: "new-row" }],
                    onConflictDoNothing: () => ({
                        returning: async () => [{ id: "new-row" }],
                    }),
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

import {
    fulfillPaymentOrder,
    PaymentFulfillmentError,
} from "@/lib/payment-fulfillment";

const USER_ID = "user_pay";
const PLAN_ID = "plan-starter";

function orderRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "order-1",
        userId: USER_ID,
        planId: PLAN_ID,
        providerOrderId: "order_1",
        amount: "129.00",
        currency: "INR",
        status: "created",
        discountId: null,
        ...overrides,
    };
}

function planRow(overrides: Record<string, unknown> = {}) {
    return {
        id: PLAN_ID,
        name: "Starter",
        price: "129.00",
        currency: "INR",
        interval: "month",
        intervalCount: 1,
        isActive: true,
        ...overrides,
    };
}

const params = {
    providerOrderId: "order_1",
    providerPaymentId: "pay_1",
    amountPaise: 12900,
    currency: "INR",
} as const;

beforeEach(() => {
    dbMock.reset();
});

describe("fulfillPaymentOrder guards", () => {
    it("is a no-op for an order that is already paid, even after a refund", async () => {
        dbMock.setQueue([
            [{ userId: USER_ID }],
            [orderRow({ status: "paid" })],
            [planRow()],
        ]);

        const result = await fulfillPaymentOrder(params);

        expect(result).toEqual({ alreadyProcessed: true, planName: "Starter" });
        expect(dbMock.updates).toHaveLength(0);
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("refuses to activate a plan for a payment that is being refunded", async () => {
        dbMock.setQueue([
            [{ userId: USER_ID }],
            [orderRow({ status: "failed" })],
            [planRow()],
            [{ id: "refund-row" }],
        ]);

        await expect(fulfillPaymentOrder(params)).rejects.toMatchObject({
            name: "PaymentFulfillmentError",
            status: 409,
            message: expect.stringContaining("refunded"),
        });
        expect(dbMock.updates).toHaveLength(0);
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("refuses a payment that would replace an active paid plan", async () => {
        dbMock.setQueue([
            [{ userId: USER_ID }],
            [orderRow()],
            [planRow({ price: "299.00", name: "Pro" })],
            [],
            [
                {
                    id: "sub-1",
                    planId: "plan-other",
                    status: "active",
                    currentPeriodStart: new Date(Date.now() - 86_400_000),
                    currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
                },
            ],
            [{ price: "129.00" }],
        ]);

        const attempt = fulfillPaymentOrder(params);

        await expect(attempt).rejects.toBeInstanceOf(PaymentFulfillmentError);
        await expect(attempt).rejects.toMatchObject({
            status: 409,
            message: expect.stringContaining("active paid plan"),
        });
        expect(dbMock.updates).toHaveLength(0);
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("rejects a payment whose amount differs from the order", async () => {
        dbMock.setQueue([
            [{ userId: USER_ID }],
            [orderRow()],
            [planRow()],
            [],
        ]);

        await expect(
            fulfillPaymentOrder({ ...params, amountPaise: 100 }),
        ).rejects.toMatchObject({ status: 400 });
    });
});
