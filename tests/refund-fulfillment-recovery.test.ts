import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Recovery paths for `applyProviderRefund` (audit R-01, R-02, R-03):
 *  - a refund that was applied on acceptance and later fails must be undone
 *  - a refund the user asked for finishes as a cancellation however it arrives
 *  - a refund of an unfulfillable payment only moves its workflow row
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
                const done = Promise.resolve(undefined);
                return {
                    returning: async () => [{ id: "refund-row-1" }],
                    onConflictDoNothing: () => ({
                        returning: async () => [{ id: "refund-row-1" }],
                        then: (
                            resolve: (value: unknown) => unknown,
                            reject: (reason: unknown) => unknown,
                        ) => done.then(resolve, reject),
                    }),
                    then: (
                        resolve: (value: unknown) => unknown,
                        reject: (reason: unknown) => unknown,
                    ) => done.then(resolve, reject),
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

import { applyProviderRefund } from "@/lib/refund-fulfillment";

const ORDER_ID = "00000000-0000-4000-8000-000000000001";
const SUB_ID = "00000000-0000-4000-8000-000000000002";
const REFUND_ROW_ID = "00000000-0000-4000-8000-000000000004";
const USER_ID = "user_refund";

function orderRow(overrides: Record<string, unknown> = {}) {
    return {
        id: ORDER_ID,
        userId: USER_ID,
        planId: "00000000-0000-4000-8000-000000000003",
        provider: "razorpay",
        providerOrderId: "order_1",
        providerPaymentId: "pay_1",
        receipt: "trv_test",
        amount: "129.00",
        amountPaid: "129.00",
        amountRefunded: "0.00",
        currency: "INR",
        discountId: null,
        status: "paid",
        ...overrides,
    };
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
    return {
        id: SUB_ID,
        userId: USER_ID,
        status: "active",
        currentPaymentOrderId: ORDER_ID,
        ...overrides,
    };
}

function userRefundRow(overrides: Record<string, unknown> = {}) {
    return {
        id: REFUND_ROW_ID,
        status: "requested",
        requestedBy: "user",
        kind: "prorated",
        appSubscriptionId: SUB_ID,
        calc: null,
        ...overrides,
    };
}

const baseParams = {
    providerPaymentId: "pay_1",
    providerRefundId: "rfnd_1",
    amountPaise: 5000,
    currency: "INR",
    notes: { refundId: REFUND_ROW_ID },
} as const;

beforeEach(() => {
    dbMock.reset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("a refund that fails after it was accepted (R-01)", () => {
    it("puts the order total, accounting row and discount back", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ amountRefunded: "50.00", discountId: "discount-1" })],
            [userRefundRow({ status: "pending" })],
            [subscriptionRow({ status: "canceled" })],
            [{ id: "accounting-1", amount: "50.00", status: "succeeded" }],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "failed",
        });

        expect(result).toEqual({
            applied: false,
            endedPlan: false,
            changed: true,
            reason: "failed",
        });
        expect(
            dbMock.updates.find((values) => "amountRefunded" in values),
        ).toMatchObject({ amountRefunded: "0.00" });
        expect(
            dbMock.updates.find(
                (values) =>
                    values.status === "failed" && "errorMessage" in values,
            ),
        ).toBeDefined();
        expect(
            dbMock.updates.find((values) => values.status === "completed"),
        ).toBeDefined();
        expect(
            dbMock.updates.find(
                (values) =>
                    values.status === "failed" &&
                    values.errorCode === "REFUND_FAILED",
            ),
        ).toBeDefined();
        // The plan stays canceled; support re-issues the refund.
        expect(
            dbMock.updates.find((values) => values.status === "active"),
        ).toBeUndefined();
    });

    it("keeps an earlier partial refund when only this one is reversed", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ amountRefunded: "80.00" })],
            [userRefundRow({ status: "pending" })],
            [subscriptionRow({ status: "canceled" })],
            [{ id: "accounting-1", amount: "50.00", status: "succeeded" }],
        ]);

        await applyProviderRefund({ ...baseParams, status: "failed" });

        expect(
            dbMock.updates.find((values) => "amountRefunded" in values),
        ).toMatchObject({ amountRefunded: "30.00" });
    });

    it("does nothing more on a replayed failed event", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ amountRefunded: "0.00" })],
            [userRefundRow({ status: "failed" })],
            [subscriptionRow({ status: "canceled" })],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "failed",
        });

        expect(result).toMatchObject({ changed: false, reason: "failed" });
        expect(dbMock.updates).toHaveLength(0);
    });

    it("does not reverse money that was never applied", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [userRefundRow({ status: "requested" })],
            [subscriptionRow()],
            [],
        ]);

        await applyProviderRefund({ ...baseParams, status: "failed" });

        expect(
            dbMock.updates.find((values) => "amountRefunded" in values),
        ).toBeUndefined();
        expect(
            dbMock.updates.find((values) => values.status === "completed"),
        ).toBeUndefined();
    });
});

describe("a user-requested refund finished by the webhook (R-02)", () => {
    it("ends the plan for a prorated refund that arrives as processed", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [userRefundRow()],
            [subscriptionRow()],
            [],
            [{ id: "invoice-1" }],
        ]);

        const result = await applyProviderRefund({
            providerPaymentId: "pay_1",
            providerRefundId: "rfnd_1",
            amountPaise: 6020,
            currency: "INR",
            notes: { refundId: REFUND_ROW_ID },
            status: "processed",
        });

        expect(result).toEqual({ applied: true, endedPlan: true, changed: true });
        expect(
            dbMock.updates.find((values) => values.status === "canceled"),
        ).toBeDefined();
    });

    it("also applies on the pending event, like cancel-now would", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [userRefundRow()],
            [subscriptionRow()],
            [],
            [{ id: "invoice-1" }],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "pending",
        });

        expect(result).toMatchObject({ applied: true, endedPlan: true });
    });

    it("ends the plan when the row was already processed by an earlier event", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ amountRefunded: "50.00" })],
            [userRefundRow({ status: "processed" })],
            [subscriptionRow()],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "processed",
        });

        expect(result).toMatchObject({ endedPlan: true, changed: true });
    });

    it("leaves an ops partial refund alone: money only, plan stays", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [userRefundRow({ requestedBy: "ops" })],
            [subscriptionRow()],
            [],
            [{ id: "invoice-1" }],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "processed",
        });

        expect(result).toMatchObject({ applied: true, endedPlan: false });
    });
});

describe("a refund of a payment that could not be fulfilled (R-03)", () => {
    function unfulfilledRow(overrides: Record<string, unknown> = {}) {
        return {
            id: REFUND_ROW_ID,
            status: "requested",
            requestedBy: "ops",
            kind: "external",
            calc: { source: "unfulfilled-payment" },
            ...overrides,
        };
    }

    it("only settles the workflow row; the order is never marked refunded", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ status: "failed", amountPaid: "0.00" })],
            [unfulfilledRow()],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 12900,
            status: "processed",
        });

        expect(result).toEqual({
            applied: false,
            endedPlan: false,
            changed: true,
            reason: "already_processed",
        });
        expect(dbMock.updates).toHaveLength(1);
        expect(dbMock.updates[0]).toMatchObject({ status: "processed" });
        expect(
            dbMock.updates.find((values) => "amountRefunded" in values),
        ).toBeUndefined();
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("records a failed refund so the support alert can fire", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ status: "failed", amountPaid: "0.00" })],
            [unfulfilledRow({ status: "pending" })],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 12900,
            status: "failed",
        });

        expect(result).toMatchObject({ changed: true, reason: "failed" });
    });

    it("is a no-op on a replay", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ status: "failed", amountPaid: "0.00" })],
            [unfulfilledRow({ status: "processed" })],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 12900,
            status: "processed",
        });

        expect(result).toMatchObject({ changed: false });
        expect(dbMock.updates).toHaveLength(0);
    });
});
