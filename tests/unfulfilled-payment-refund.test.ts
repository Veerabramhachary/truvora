import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    let queue: unknown[][] = [];
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];

    const chain = () => {
        const result: Record<string, unknown> = {
            from: () => result,
            where: () => result,
            limit: () => result,
            for: () => result,
            then: (
                resolve: (value: unknown) => unknown,
                reject: (reason: unknown) => unknown,
            ) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
        };
        return result;
    };

    const update = () => ({
        set: (values: Record<string, unknown>) => {
            updates.push(values);
            return { where: async () => undefined };
        },
    });

    const tx = {
        select: () => chain(),
        update,
        insert: () => ({
            values: (values: Record<string, unknown>) => {
                inserts.push(values);
                return { returning: async () => [{ id: "row-1" }] };
            },
        }),
        execute: async () => undefined,
    };

    return {
        updates,
        inserts,
        tx,
        db: {
            transaction: (fn: (tx: unknown) => unknown) => fn(tx),
            select: () => chain(),
            update,
        },
        setQueue: (next: unknown[][]) => {
            queue = next;
        },
        reset: () => {
            queue = [];
            updates.length = 0;
            inserts.length = 0;
        },
        config: vi.fn(),
        createRefund: vi.fn(),
        alert: vi.fn(),
        notice: vi.fn(),
    };
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/razorpay", () => ({
    getRazorpayConfig: mocks.config,
    createRazorpayRefund: mocks.createRefund,
    RazorpayError: class RazorpayError extends Error {
        status: number | null;
        code: string | null;
        retryable: boolean;
        constructor(
            message: string,
            status: number | null = null,
            options: { code?: string | null; retryable?: boolean } = {},
        ) {
            super(message);
            this.status = status;
            this.code = options.code ?? null;
            this.retryable = options.retryable ?? false;
        }
    },
}));
vi.mock("@/lib/refund-emails", () => ({
    sendRefundFailureAlert: mocks.alert,
    sendUnfulfilledPaymentNotice: mocks.notice,
}));

import { RazorpayError } from "@/lib/razorpay";
import { refundUnfulfilledPayment } from "@/lib/unfulfilled-payment-refund";

const params = {
    providerOrderId: "order_1",
    providerPaymentId: "pay_1",
    amountPaise: 12900,
    reason: "unfulfillable",
};

function orderRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "order-1",
        userId: "user_1",
        status: "failed",
        amount: "129.00",
        currency: "INR",
        providerPaymentId: null,
        ...overrides,
    };
}

// owner, order, in-flight refund
function readyQueue(order = orderRow(), existing: unknown[] = []) {
    return [[{ userId: "user_1" }], [order], existing];
}

beforeEach(() => {
    mocks.reset();
    mocks.config.mockReset().mockReturnValue({ keyId: "k", keySecret: "s" });
    mocks.createRefund.mockReset().mockResolvedValue({
        id: "rfnd_1",
        status: "pending",
        amount: 12900,
        currency: "INR",
    });
    mocks.alert.mockReset().mockResolvedValue(undefined);
    mocks.notice.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("refundUnfulfilledPayment", () => {
    it("refunds the full captured amount and tells the customer", async () => {
        mocks.setQueue([...readyQueue(), [{ email: "asha@example.com" }]]);

        const result = await refundUnfulfilledPayment(params);

        expect(result).toEqual({
            outcome: "refund_started",
            refundId: "row-1",
            providerRefundId: "rfnd_1",
        });
        expect(mocks.createRefund).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentId: "pay_1",
                amountPaise: 12900,
                idempotencyKey: "rfnd-row-1",
                notes: { refundId: "row-1", orderId: "order_1" },
            }),
            expect.anything(),
        );
        // The payment id is stored so refund webhooks can find the order.
        expect(mocks.updates).toContainEqual(
            expect.objectContaining({ providerPaymentId: "pay_1" }),
        );
        expect(mocks.inserts[0]).toMatchObject({
            kind: "external",
            status: "requested",
            amount: "129.00",
            calc: expect.objectContaining({ source: "unfulfilled-payment" }),
        });
        expect(mocks.updates).toContainEqual(
            expect.objectContaining({
                status: "pending",
                providerRefundId: "rfnd_1",
            }),
        );
        expect(mocks.notice).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "asha@example.com",
                refundId: "rfnd_1",
            }),
        );
        // The order total is not touched: the order was never paid.
        expect(
            mocks.updates.find((values) => "amountRefunded" in values),
        ).toBeUndefined();
    });

    it("skips an order that was fulfilled in the meantime", async () => {
        mocks.setQueue(readyQueue(orderRow({ status: "paid" })));

        const result = await refundUnfulfilledPayment(params);

        expect(result).toEqual({ outcome: "skipped", reason: "already_paid" });
        expect(mocks.createRefund).not.toHaveBeenCalled();
    });

    it("does not start a second refund when one is already under way", async () => {
        mocks.setQueue(readyQueue(orderRow(), [{ id: "existing-refund" }]));

        const result = await refundUnfulfilledPayment(params);

        expect(result).toEqual({
            outcome: "skipped",
            reason: "already_refunding",
        });
        expect(mocks.createRefund).not.toHaveBeenCalled();
        expect(mocks.inserts).toHaveLength(0);
    });

    it("never refunds an amount that is not the order amount", async () => {
        mocks.setQueue(readyQueue());

        const result = await refundUnfulfilledPayment({
            ...params,
            amountPaise: 100,
        });

        expect(result).toEqual({
            outcome: "skipped",
            reason: "amount_mismatch",
        });
        expect(mocks.createRefund).not.toHaveBeenCalled();
    });

    it("marks the row failed and alerts support when Razorpay rejects it", async () => {
        mocks.setQueue(readyQueue());
        mocks.createRefund.mockRejectedValue(
            new RazorpayError("bad request", 400, {
                code: "BAD_REQUEST_ERROR",
                retryable: false,
            }),
        );

        const result = await refundUnfulfilledPayment(params);

        expect(result).toEqual({ outcome: "rejected", refundId: "row-1" });
        expect(mocks.updates).toContainEqual(
            expect.objectContaining({
                status: "failed",
                errorCode: "BAD_REQUEST_ERROR",
            }),
        );
        expect(mocks.alert).toHaveBeenCalledWith("row-1");
        expect(mocks.notice).not.toHaveBeenCalled();
    });

    it("leaves the row requested when Razorpay cannot be reached", async () => {
        mocks.setQueue(readyQueue());
        mocks.createRefund.mockRejectedValue(
            new RazorpayError("timeout", null, {
                code: "TIMEOUT",
                retryable: true,
            }),
        );

        const result = await refundUnfulfilledPayment(params);

        expect(result).toEqual({ outcome: "pending_retry", refundId: "row-1" });
        expect(
            mocks.updates.find((values) => values.status === "failed"),
        ).toBeUndefined();
        expect(mocks.alert).not.toHaveBeenCalled();
    });

    it("does nothing when payments are not configured", async () => {
        mocks.config.mockReturnValue(null);

        const result = await refundUnfulfilledPayment(params);

        expect(result).toEqual({
            outcome: "skipped",
            reason: "not_configured",
        });
        expect(mocks.createRefund).not.toHaveBeenCalled();
    });

    it("never throws into a payment handler that is already failing", async () => {
        mocks.setQueue(readyQueue());
        mocks.createRefund.mockRejectedValue(new TypeError("boom"));
        mocks.db.transaction = () => {
            throw new Error("db down");
        };

        await expect(refundUnfulfilledPayment(params)).resolves.toEqual({
            outcome: "error",
        });
    });
});
