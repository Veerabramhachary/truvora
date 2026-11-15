import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-11-03T00:00:00.000Z");
const ORDER_ID = "00000000-0000-4000-8000-000000000001";
const SUB_ID = "00000000-0000-4000-8000-000000000002";
const REFUND_ID = "00000000-0000-4000-8000-000000000003";
const USER_ID = "user_1";

const mocks = vi.hoisted(() => {
    let queue: unknown[][] = [];
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];

    class TestRazorpayError extends Error {
        code: string | null;
        retryable: boolean;

        constructor(
            message: string,
            status: number | null = null,
            options: { code?: string | null; retryable?: boolean } = {},
        ) {
            super(message);
            void status;
            this.code = options.code ?? null;
            this.retryable = options.retryable ?? false;
        }
    }

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

    const write = () => ({
        set: (values: Record<string, unknown>) => {
            updates.push(values);
            return { where: async () => undefined };
        },
    });

    const tx = {
        select: vi.fn(() => chain()),
        insert: vi.fn(() => ({
            values: (values: Record<string, unknown>) => {
                inserts.push(values);
                return { returning: async () => [{ id: REFUND_ID }] };
            },
        })),
        update: vi.fn(write),
        execute: vi.fn(async () => undefined),
    };

    return {
        chain,
        setQueue: (next: unknown[][]) => {
            queue = next;
        },
        updates,
        inserts,
        tx,
        TestRazorpayError,
        createRefund: vi.fn(),
        applyRefund: vi.fn(),
        sendEmail: vi.fn(),
        billing: null as unknown,
    };
});

vi.mock("@/db", () => ({
    db: {
        select: vi.fn(() => mocks.chain()),
        update: vi.fn(() => ({
            set: (values: Record<string, unknown>) => {
                mocks.updates.push(values);
                return { where: async () => undefined };
            },
        })),
        transaction: (fn: (tx: unknown) => unknown) => fn(mocks.tx),
    },
}));

vi.mock("@/lib/billing-state", () => ({
    getBillingState: vi.fn(async () => mocks.billing),
}));

vi.mock("@/lib/razorpay", () => ({
    RazorpayError: mocks.TestRazorpayError,
    getRazorpayConfig: () => ({
        keyId: "rzp_test",
        keySecret: "secret",
        webhookSecret: null,
    }),
    createRazorpayRefund: mocks.createRefund,
}));

vi.mock("@/lib/refund-emails", () => ({
    sendRefundConfirmation: mocks.sendEmail,
}));

vi.mock("@/lib/refund-fulfillment", () => ({
    applyProviderRefund: mocks.applyRefund,
    refundStatusFromProvider: (status: string) =>
        status === "processed"
            ? "processed"
            : status === "failed"
              ? "failed"
              : "pending",
}));

import { cancelNow, CancellationError } from "@/lib/refund-service";

function orderRow(overrides: Record<string, unknown> = {}) {
    return {
        id: ORDER_ID,
        userId: USER_ID,
        provider: "razorpay",
        providerOrderId: "order_1",
        providerPaymentId: "pay_1",
        amount: "1000.00",
        amountPaid: "1000.00",
        amountRefunded: "0.00",
        currency: "INR",
        status: "paid",
        paidAt: new Date("2026-11-01T00:00:00.000Z"),
        periodStart: new Date("2026-11-01T00:00:00.000Z"),
        periodEnd: new Date("2026-12-01T00:00:00.000Z"),
        discountId: null,
        ...overrides,
    };
}

function subscriptionRow() {
    return {
        id: SUB_ID,
        userId: USER_ID,
        status: "active",
        currentPaymentOrderId: ORDER_ID,
        currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
    };
}

function paidBilling() {
    return {
        status: "paid",
        plan: { name: "Pro" },
        subscriptionPlan: { name: "Pro" },
        subscription: subscriptionRow(),
        currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
        fundingOrderId: ORDER_ID,
    };
}

async function thrown(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error("Expected the call to fail");
}

beforeEach(() => {
    process.env.BILLING_REFUNDS_ENABLED = "true";
    mocks.updates.length = 0;
    mocks.inserts.length = 0;
    mocks.setQueue([]);
    mocks.tx.execute.mockClear();
    mocks.billing = paidBilling();
    mocks.createRefund.mockReset();
    mocks.applyRefund.mockReset();
    mocks.sendEmail.mockReset();
    mocks.createRefund.mockResolvedValue({
        id: "rfnd_1",
        payment_id: "pay_1",
        amount: 100000,
        currency: "INR",
        status: "processed",
    });
    mocks.applyRefund.mockResolvedValue({
        applied: true,
        endedPlan: true,
        changed: true,
    });
});

const originalFlag = process.env.BILLING_REFUNDS_ENABLED;
afterEach(() => {
    if (originalFlag === undefined) delete process.env.BILLING_REFUNDS_ENABLED;
    else process.env.BILLING_REFUNDS_ENABLED = originalFlag;
});

// The db mock's queue is shared by the preview reads and the transaction.

describe("cancelNow", () => {
    it("refuses an inactive plan before touching the database", async () => {
        mocks.billing = { ...paidBilling(), status: "expired" };

        const error = await thrown(
            cancelNow({ userId: USER_ID, expectedRefund: "1000.00", now: NOW }),
        );

        expect(error).toBeInstanceOf(CancellationError);
        expect(error).toMatchObject({ status: 409, code: "not_eligible" });
        expect(mocks.tx.execute).not.toHaveBeenCalled();
    });

    it("rejects a stale expected amount", async () => {
        mocks.setQueue([[orderRow()], []]);

        const error = await thrown(
            cancelNow({ userId: USER_ID, expectedRefund: "999.00", now: NOW }),
        );

        expect(error).toMatchObject({ status: 409, code: "stale_amount" });
        expect(mocks.tx.execute).not.toHaveBeenCalled();
    });

    it("re-checks the amount inside the transaction", async () => {
        // The preview sees 1000.00; by TX1 a dashboard refund left 500.00.
        mocks.setQueue([
            [orderRow()],
            [],
            [subscriptionRow()],
            [orderRow({ amountRefunded: "500.00" })],
            [],
        ]);

        const error = await thrown(
            cancelNow({ userId: USER_ID, expectedRefund: "1000.00", now: NOW }),
        );

        expect(error).toMatchObject({ status: 409, code: "stale_amount" });
        expect(
            (error as CancellationError).preview?.refundAmount,
        ).toBe("500.00");
        expect(mocks.createRefund).not.toHaveBeenCalled();
    });

    it("refuses a second refund for the same order", async () => {
        mocks.setQueue([
            [orderRow()],
            [],
            [subscriptionRow()],
            [orderRow()],
            [],
            [{ id: "existing-refund" }],
        ]);

        const error = await thrown(
            cancelNow({ userId: USER_ID, expectedRefund: "1000.00", now: NOW }),
        );

        expect(error).toMatchObject({
            status: 409,
            code: "already_in_progress",
        });
        expect(mocks.createRefund).not.toHaveBeenCalled();
    });

    it("creates the refund, ends the plan and sends one email", async () => {
        mocks.setQueue([
            [orderRow()],
            [],
            [subscriptionRow()],
            [orderRow()],
            [],
            [],
            [{ email: "user@example.com" }],
        ]);

        const result = await cancelNow({
            userId: USER_ID,
            expectedRefund: "1000.00",
            reason: "too_expensive",
            now: NOW,
        });

        expect(result).toMatchObject({
            refundId: REFUND_ID,
            providerRefundId: "rfnd_1",
            amount: "1000.00",
            planEnded: true,
        });
        expect(mocks.inserts[0]).toMatchObject({
            paymentOrderId: ORDER_ID,
            status: "requested",
            amount: "1000.00",
            kind: "full_window",
            requestedBy: "user",
        });
        expect(mocks.createRefund).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentId: "pay_1",
                amountPaise: 100000,
                idempotencyKey: `rfnd-${REFUND_ID}`,
            }),
            expect.anything(),
        );
        expect(mocks.applyRefund).toHaveBeenCalledWith(
            expect.objectContaining({
                status: "processed",
                applyWhenPending: true,
                endPlan: true,
                cancelReason: "too_expensive",
            }),
        );
        expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    });

    it("marks the request failed when Razorpay permanently rejects it", async () => {
        mocks.setQueue([
            [orderRow()],
            [],
            [subscriptionRow()],
            [orderRow()],
            [],
            [],
        ]);
        mocks.createRefund.mockRejectedValue(
            new mocks.TestRazorpayError("rejected", 400, {
                code: "BAD_REQUEST_ERROR",
                retryable: false,
            }),
        );

        const error = await thrown(
            cancelNow({ userId: USER_ID, expectedRefund: "1000.00", now: NOW }),
        );

        expect(error).toMatchObject({ status: 400, code: "provider_rejected" });
        expect(mocks.updates[0]).toMatchObject({
            status: "failed",
            errorCode: "BAD_REQUEST_ERROR",
        });
        expect(mocks.applyRefund).not.toHaveBeenCalled();
    });

    it("leaves the request retryable when Razorpay times out", async () => {
        mocks.setQueue([
            [orderRow()],
            [],
            [subscriptionRow()],
            [orderRow()],
            [],
            [],
        ]);
        mocks.createRefund.mockRejectedValue(
            new mocks.TestRazorpayError("timeout", 504, { retryable: true }),
        );

        const error = await thrown(
            cancelNow({ userId: USER_ID, expectedRefund: "1000.00", now: NOW }),
        );

        expect(error).toMatchObject({ status: 503, code: "provider_timeout" });
        expect(mocks.updates).toHaveLength(0);
        expect(mocks.applyRefund).not.toHaveBeenCalled();
    });
});
