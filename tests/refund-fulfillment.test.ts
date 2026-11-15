import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The webhook may deliver `refund.created` and `refund.processed` for the same
 * refund, and Razorpay may deliver either first. The `payment_refunds` row is
 * the state machine: only the transition to `processed` moves money, so a
 * replay can neither double-count nor re-grant.
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
        discountAmount: null,
        discountCurrency: null,
        periodStart: null,
        periodEnd: null,
        status: "paid",
        notes: null,
        failureReason: null,
        paidAt: new Date("2026-11-01T00:00:00.000Z"),
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
        updatedAt: new Date("2026-11-01T00:00:00.000Z"),
        ...overrides,
    };
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
    return {
        id: SUB_ID,
        userId: USER_ID,
        planId: "00000000-0000-4000-8000-000000000003",
        status: "active",
        currentPaymentOrderId: ORDER_ID,
        currentPeriodStart: new Date("2026-11-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
        ...overrides,
    };
}

const baseParams = {
    providerPaymentId: "pay_1",
    providerRefundId: "rfnd_1",
    amountPaise: 12900,
    currency: "INR",
} as const;

beforeEach(() => {
    dbMock.reset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("applyProviderRefund", () => {
    it("records a full dashboard refund and ends the plan", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [],
            [subscriptionRow()],
            [],
            [{ id: "invoice-1" }],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "processed",
        });

        expect(result).toEqual({
            applied: true,
            endedPlan: true,
            changed: true,
        });

        const orderUpdate = dbMock.updates.find(
            (values) => "amountRefunded" in values,
        );
        expect(orderUpdate).toMatchObject({ amountRefunded: "129.00" });

        const subscriptionUpdate = dbMock.updates.find(
            (values) => values.status === "canceled",
        );
        expect(subscriptionUpdate).toBeDefined();

        const refundInsert = dbMock.inserts.find(
            (values) => values.status === "processed",
        );
        expect(refundInsert).toMatchObject({
            kind: "external",
            requestedBy: "provider",
            amount: "129.00",
            providerRefundId: "rfnd_1",
        });

        const accounting = dbMock.inserts.find(
            (values) => values.type === "refund",
        );
        expect(accounting).toMatchObject({
            subscriptionsId: SUB_ID,
            invoiceId: "invoice-1",
            status: "succeeded",
            idempotencyKey: "razorpay:refund:rfnd_1",
            providerTransactionId: "rfnd_1",
        });
    });

    it("records a partial dashboard refund without ending the plan", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [],
            [subscriptionRow()],
            [],
            [{ id: "invoice-1" }],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 5000,
            status: "processed",
        });

        expect(result).toMatchObject({ applied: true, endedPlan: false });
        expect(
            dbMock.updates.find((values) => "amountRefunded" in values),
        ).toMatchObject({ amountRefunded: "50.00" });
        expect(
            dbMock.updates.find((values) => values.status === "canceled"),
        ).toBeUndefined();
    });

    it("does not end the plan when the refunded order is not the funding order", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [],
            [subscriptionRow({ currentPaymentOrderId: "older-order" })],
            [],
            [{ id: "invoice-1" }],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "processed",
        });

        expect(result).toMatchObject({ applied: true, endedPlan: false });
        expect(
            dbMock.updates.find((values) => values.status === "canceled"),
        ).toBeUndefined();
    });

    it("is a no-op when the refund was already processed", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [{ id: "refund-row-1", status: "processed" }],
            [subscriptionRow()],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 5000,
            status: "processed",
        });

        expect(result).toEqual({
            applied: false,
            endedPlan: false,
            changed: false,
            reason: "already_processed",
        });
        expect(dbMock.updates).toHaveLength(0);
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("still ends the plan when cancel-now runs after the refund webhook", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [{ id: "refund-row-1", status: "processed" }],
            [subscriptionRow()],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 5000,
            status: "processed",
            endPlan: true,
        });

        expect(result).toEqual({
            applied: false,
            endedPlan: true,
            changed: true,
            reason: "already_processed",
        });
        expect(
            dbMock.updates.find((values) => values.status === "canceled"),
        ).toBeDefined();
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("stores a pending event without moving money", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [],
            [subscriptionRow()],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "pending",
        });

        expect(result).toEqual({
            applied: false,
            endedPlan: false,
            changed: true,
            reason: "pending",
        });
        expect(dbMock.updates).toHaveLength(0);
        expect(dbMock.inserts).toHaveLength(1);
        expect(dbMock.inserts[0]).toMatchObject({ status: "pending" });
    });

    it("records a failed event without restoring or ending the plan", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [{ id: "refund-row-1", status: "pending" }],
            [subscriptionRow()],
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
        expect(dbMock.updates).toEqual([
            expect.objectContaining({ status: "failed" }),
        ]);
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("ignores a refund for an order that was never paid", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ status: "failed", amountPaid: "0.00" })],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "processed",
        });

        expect(result).toEqual({
            applied: false,
            endedPlan: false,
            changed: false,
            reason: "order_not_paid",
        });
        expect(dbMock.updates).toHaveLength(0);
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("refuses an over-refund instead of violating the database check", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ amountRefunded: "100.00" })],
            [],
            [subscriptionRow()],
        ]);
        vi.spyOn(console, "error").mockImplementation(() => {});

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 5000,
            status: "processed",
        });

        expect(result).toEqual({
            applied: false,
            endedPlan: false,
            changed: false,
            reason: "over_refund",
        });
        expect(dbMock.updates).toHaveLength(0);
        expect(dbMock.inserts).toHaveLength(0);
    });

    it("ignores a refund for an unknown payment", async () => {
        dbMock.setQueue([[]]);

        const result = await applyProviderRefund({
            ...baseParams,
            status: "processed",
        });

        expect(result).toMatchObject({ applied: false, reason: "order_not_found" });
    });

    it("applies a pending refund and ends the plan when the caller opts in", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow()],
            [{ id: "refund-row-1", status: "requested" }],
            [subscriptionRow()],
            [],
            [{ id: "invoice-1" }],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 5000,
            status: "pending",
            requestedBy: "user",
            kind: "prorated",
            applyWhenPending: true,
            endPlan: true,
        });

        expect(result).toEqual({ applied: true, endedPlan: true, changed: true });
        expect(
            dbMock.updates.find((values) => "amountRefunded" in values),
        ).toMatchObject({ amountRefunded: "50.00" });
        expect(
            dbMock.updates.find((values) => values.status === "canceled"),
        ).toBeDefined();
        expect(
            dbMock.inserts.find((values) => values.type === "refund"),
        ).toMatchObject({ idempotencyKey: "razorpay:refund:rfnd_1" });
    });

    it("only settles the status when a pending refund is confirmed later", async () => {
        dbMock.setQueue([
            [{ id: ORDER_ID, userId: USER_ID }],
            [orderRow({ amountRefunded: "50.00" })],
            [{ id: "refund-row-1", status: "pending" }],
            [subscriptionRow()],
            [{ id: "accounting-1" }],
        ]);

        const result = await applyProviderRefund({
            ...baseParams,
            amountPaise: 5000,
            status: "processed",
        });

        expect(result).toEqual({
            applied: false,
            endedPlan: false,
            changed: true,
            reason: "already_processed",
        });
        expect(
            dbMock.updates.find((values) => "amountRefunded" in values),
        ).toBeUndefined();
        expect(dbMock.inserts).toHaveLength(0);
        expect(
            dbMock.updates.find((values) => values.processedAt instanceof Date),
        ).toMatchObject({ status: "processed" });
    });
});
