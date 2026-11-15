import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => {
    let queue: unknown[][] = [];
    const updates: Array<Record<string, unknown>> = [];

    const chain = () => {
        const result: Record<string, unknown> = {
            from: () => result,
            where: () => result,
            orderBy: () => result,
            limit: () => result,
            then: (
                resolve: (value: unknown) => unknown,
                reject: (reason: unknown) => unknown,
            ) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
        };
        return result;
    };

    return {
        updates,
        select: vi.fn(() => chain()),
        update: vi.fn(() => ({
            set: (values: Record<string, unknown>) => {
                updates.push(values);
                return { where: async () => undefined };
            },
        })),
        setQueue: (next: unknown[][]) => {
            queue = next;
        },
        reset: () => {
            queue = [];
            updates.length = 0;
        },
    };
});

const provider = vi.hoisted(() => ({
    list: vi.fn(),
    fetch: vi.fn(),
    create: vi.fn(),
}));

const apply = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
    db: { select: dbMock.select, update: dbMock.update },
}));

vi.mock("@/lib/razorpay", () => {
    class RazorpayError extends Error {
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

    return {
        RazorpayError,
        getRazorpayConfig: () => ({
            keyId: "rzp_test",
            keySecret: "secret",
            webhookSecret: null,
        }),
        fetchRazorpayPaymentRefunds: provider.list,
        fetchRazorpayRefund: provider.fetch,
        createRazorpayRefund: provider.create,
    };
});

vi.mock("@/lib/refund-fulfillment", () => ({
    applyProviderRefund: apply,
    refundIdFromNotes: (notes: unknown) =>
        (notes as { refundId?: string } | null)?.refundId ?? null,
    refundStatusFromProvider: (status: string) =>
        status === "processed"
            ? "processed"
            : status === "failed"
              ? "failed"
              : "pending",
}));

import { RazorpayError } from "@/lib/razorpay";
import { reconcileRefunds } from "@/lib/refund-reconciler";

const ORDER_ID = "00000000-0000-4000-8000-000000000001";
const REFUND_ID = "00000000-0000-4000-8000-000000000002";
const PROVIDER_REFUND_ID = "rfnd_1";

function refundRow(overrides: Record<string, unknown> = {}) {
    return {
        id: REFUND_ID,
        paymentOrderId: ORDER_ID,
        status: "requested",
        amount: "500.00",
        currency: "INR",
        providerRefundId: null,
        kind: "prorated",
        requestedBy: "user",
        speedRequested: "normal",
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
        updatedAt: new Date("2026-11-01T00:00:00.000Z"),
        processedAt: null,
        ...overrides,
    };
}

function orderRow(overrides: Record<string, unknown> = {}) {
    return {
        id: ORDER_ID,
        providerPaymentId: "pay_1",
        providerOrderId: "order_1",
        currency: "INR",
        ...overrides,
    };
}

beforeEach(() => {
    dbMock.reset();
    provider.list.mockReset();
    provider.fetch.mockReset();
    provider.create.mockReset();
    apply.mockReset();
    apply.mockResolvedValue({ applied: true, endedPlan: true, changed: true });
});

describe("reconcileRefunds", () => {
    it("reports counts in a dry run without calling Razorpay", async () => {
        dbMock.setQueue([[refundRow()], [refundRow({ status: "pending" })]]);

        const summary = await reconcileRefunds({ dryRun: true });

        expect(summary).toMatchObject({
            dryRun: true,
            requested: 1,
            pending: 1,
            settled: 0,
            failed: 0,
        });
        expect(provider.list).not.toHaveBeenCalled();
        expect(provider.create).not.toHaveBeenCalled();
        expect(apply).not.toHaveBeenCalled();
    });

    it("settles a requested refund that Razorpay already has", async () => {
        dbMock.setQueue([
            [refundRow()],
            [],
            [orderRow()],
        ]);
        provider.list.mockResolvedValue({
            entity: [
                {
                    id: PROVIDER_REFUND_ID,
                    payment_id: "pay_1",
                    amount: 50000,
                    currency: "INR",
                    status: "processed",
                    notes: { refundId: REFUND_ID },
                },
            ],
            count: 1,
        });

        const summary = await reconcileRefunds();

        expect(summary).toMatchObject({ settled: 1, failed: 0 });
        expect(provider.create).not.toHaveBeenCalled();
        expect(apply).toHaveBeenCalledWith(
            expect.objectContaining({
                providerRefundId: PROVIDER_REFUND_ID,
                amountPaise: 50000,
                status: "processed",
                applyWhenPending: true,
                endPlan: true,
            }),
        );
    });

    it("retries a lost request with the same idempotency key", async () => {
        dbMock.setQueue([[refundRow()], [], [orderRow()]]);
        provider.list.mockResolvedValue({ entity: [], count: 0 });
        provider.create.mockResolvedValue({
            id: PROVIDER_REFUND_ID,
            payment_id: "pay_1",
            amount: 50000,
            currency: "INR",
            status: "pending",
        });

        const summary = await reconcileRefunds();

        expect(summary).toMatchObject({ settled: 1, failed: 0 });
        expect(provider.create).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentId: "pay_1",
                amountPaise: 50000,
                idempotencyKey: `rfnd-${REFUND_ID}`,
            }),
            expect.anything(),
        );
    });

    it("marks a permanently rejected refund failed", async () => {
        dbMock.setQueue([[refundRow()], [], [orderRow()]]);
        provider.list.mockResolvedValue({ entity: [], count: 0 });
        provider.create.mockRejectedValue(
            new RazorpayError("bad request", 400, {
                code: "BAD_REQUEST_ERROR",
                retryable: false,
            }),
        );

        const summary = await reconcileRefunds();

        expect(summary).toMatchObject({ settled: 0, failed: 1 });
        expect(dbMock.updates[0]).toMatchObject({
            status: "failed",
            errorCode: "BAD_REQUEST_ERROR",
        });
        expect(apply).not.toHaveBeenCalled();
    });

    it("leaves a still-pending refund alone", async () => {
        dbMock.setQueue([
            [],
            [refundRow({ status: "pending", providerRefundId: PROVIDER_REFUND_ID })],
            [orderRow()],
        ]);
        provider.fetch.mockResolvedValue({
            id: PROVIDER_REFUND_ID,
            payment_id: "pay_1",
            amount: 50000,
            currency: "INR",
            status: "pending",
        });

        const summary = await reconcileRefunds();

        expect(summary).toMatchObject({ pending: 1, settled: 1, failed: 0 });
        expect(apply).not.toHaveBeenCalled();
    });

    it("settles a pending refund that Razorpay has since processed", async () => {
        dbMock.setQueue([
            [],
            [refundRow({ status: "pending", providerRefundId: PROVIDER_REFUND_ID })],
            [orderRow()],
        ]);
        provider.fetch.mockResolvedValue({
            id: PROVIDER_REFUND_ID,
            payment_id: "pay_1",
            amount: 50000,
            currency: "INR",
            status: "processed",
        });

        const summary = await reconcileRefunds();

        expect(summary).toMatchObject({ settled: 1, failed: 0 });
        expect(apply).toHaveBeenCalledWith(
            expect.objectContaining({ status: "processed" }),
        );
    });
});
