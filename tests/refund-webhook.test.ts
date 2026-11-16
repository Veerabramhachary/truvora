import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    apply: vi.fn(),
    fulfill: vi.fn(),
    failure: vi.fn(),
    send: vi.fn(),
    unfulfilled: vi.fn(),
}));

vi.mock("@/lib/unfulfilled-payment-refund", () => ({
    refundUnfulfilledPayment: mocks.unfulfilled,
}));

vi.mock("@/lib/refund-fulfillment", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/refund-fulfillment")>()),
    applyProviderRefund: mocks.apply,
}));

vi.mock("@/lib/payment-fulfillment", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/payment-fulfillment")>()),
    fulfillPaymentOrder: mocks.fulfill,
    recordPaymentFailure: mocks.failure,
}));

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: mocks.send };
    },
}));

import { POST } from "@/app/api/webhooks/razorpay/route";
import { PaymentFulfillmentError } from "@/lib/payment-fulfillment";

const SECRET = "whsec_test";

function signedRequest(payload: unknown): NextRequest {
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", SECRET).update(body).digest("hex");
    return new NextRequest("http://localhost/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": signature },
        body,
    });
}

function refundEvent(
    event: string,
    status: string,
    options: {
        captured?: boolean;
        amount?: number;
        notes?: unknown;
        currency?: string | null;
    } = {},
) {
    return {
        event,
        payload: {
            payment: {
                entity: {
                    id: "pay_1",
                    order_id: "order_1",
                    amount: 12900,
                    currency: "INR",
                    status: "captured",
                    captured: options.captured ?? true,
                },
            },
            refund: {
                entity: {
                    id: "rfnd_1",
                    payment_id: "pay_1",
                    amount: options.amount ?? 12900,
                    currency:
                        options.currency === undefined
                            ? "INR"
                            : options.currency,
                    status,
                    notes: options.notes ?? { refundId: "refund-row-1" },
                },
            },
        },
    };
}

beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    mocks.apply.mockReset().mockResolvedValue({
        applied: true,
        endedPlan: false,
        changed: true,
    });
    mocks.fulfill.mockReset().mockResolvedValue({
        alreadyProcessed: false,
        planName: "Starter",
    });
    mocks.failure.mockReset().mockResolvedValue(undefined);
    mocks.send.mockReset().mockResolvedValue({ error: null });
    mocks.unfulfilled
        .mockReset()
        .mockResolvedValue({ outcome: "refund_started" });
});

afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RESEND_API_KEY;
    delete process.env.RENEWAL_EMAIL_FROM;
    delete process.env.SUPPORT_EMAIL;
    vi.restoreAllMocks();
});

describe("Razorpay refund webhook", () => {
    it("rejects a bad signature before applying anything", async () => {
        const request = new NextRequest(
            "http://localhost/api/webhooks/razorpay",
            {
                method: "POST",
                headers: { "x-razorpay-signature": "not-hex" },
                body: JSON.stringify(refundEvent("refund.processed", "processed")),
            },
        );

        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(mocks.apply).not.toHaveBeenCalled();
    });

    it("applies a processed dashboard refund", async () => {
        const response = await POST(
            signedRequest(
                refundEvent("refund.processed", "processed", { notes: [] }),
            ),
        );

        expect(response.status).toBe(200);
        expect(mocks.apply).toHaveBeenCalledWith({
            providerPaymentId: "pay_1",
            providerRefundId: "rfnd_1",
            amountPaise: 12900,
            currency: "INR",
            status: "processed",
            notes: [],
        });
        await expect(response.json()).resolves.toMatchObject({
            received: true,
            applied: true,
        });
    });

    it("keeps an accepted refund pending until it is processed", async () => {
        mocks.apply.mockResolvedValue({
            applied: false,
            endedPlan: false,
            changed: true,
            reason: "pending",
        });

        const response = await POST(
            signedRequest(refundEvent("refund.created", "pending")),
        );

        expect(response.status).toBe(200);
        expect(mocks.apply).toHaveBeenCalledWith(
            expect.objectContaining({ status: "pending" }),
        );
    });

    it("alerts support once when a refund fails", async () => {
        process.env.RESEND_API_KEY = "re_test";
        process.env.RENEWAL_EMAIL_FROM = "Truvora <billing@example.com>";
        process.env.SUPPORT_EMAIL = "support@example.com";
        mocks.apply.mockResolvedValue({
            applied: false,
            endedPlan: false,
            changed: true,
            reason: "failed",
        });

        const response = await POST(
            signedRequest(refundEvent("refund.failed", "failed")),
        );

        expect(response.status).toBe(200);
        expect(mocks.send).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "support@example.com",
                subject: "Truvora refund failed",
            }),
            expect.objectContaining({ idempotencyKey: "refund-failed/rfnd_1" }),
        );
    });

    it("does not re-alert for a replayed failed event", async () => {
        process.env.RESEND_API_KEY = "re_test";
        process.env.RENEWAL_EMAIL_FROM = "Truvora <billing@example.com>";
        process.env.SUPPORT_EMAIL = "support@example.com";
        mocks.apply.mockResolvedValue({
            applied: false,
            endedPlan: false,
            changed: false,
            reason: "failed",
        });

        await POST(signedRequest(refundEvent("refund.failed", "failed")));

        expect(mocks.send).not.toHaveBeenCalled();
    });

    it("ignores refund.speed_changed", async () => {
        const response = await POST(
            signedRequest(refundEvent("refund.speed_changed", "processed")),
        );

        expect(response.status).toBe(200);
        expect(mocks.apply).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({ ignored: true });
    });

    it("ignores an auto-refund of an uncaptured payment", async () => {
        const response = await POST(
            signedRequest(
                refundEvent("refund.processed", "processed", {
                    captured: false,
                }),
            ),
        );

        expect(response.status).toBe(200);
        expect(mocks.apply).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({ ignored: true });
    });

    it("auto-refunds a captured payment that fulfillment refuses (R-03)", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        mocks.fulfill.mockRejectedValue(
            new PaymentFulfillmentError(
                "An active paid plan already covers this period.",
                409,
            ),
        );

        const response = await POST(
            signedRequest({
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_1",
                            order_id: "order_1",
                            amount: 12900,
                            currency: "INR",
                            status: "captured",
                        },
                    },
                },
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.failure).toHaveBeenCalled();
        expect(mocks.unfulfilled).toHaveBeenCalledWith({
            providerOrderId: "order_1",
            providerPaymentId: "pay_1",
            amountPaise: 12900,
            reason: "unfulfillable",
        });
    });

    it("does not auto-refund an amount mismatch; that needs a person", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        mocks.fulfill.mockRejectedValue(
            new PaymentFulfillmentError(
                "Payment amount does not match the order",
                400,
            ),
        );

        const response = await POST(
            signedRequest({
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_1",
                            order_id: "order_1",
                            amount: 100,
                            currency: "INR",
                            status: "captured",
                        },
                    },
                },
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.unfulfilled).not.toHaveBeenCalled();
    });

    it("still dispatches payment.captured to fulfillment", async () => {
        const response = await POST(
            signedRequest({
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_1",
                            order_id: "order_1",
                            amount: 12900,
                            currency: "INR",
                            status: "captured",
                        },
                    },
                },
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.fulfill).toHaveBeenCalledWith({
            providerOrderId: "order_1",
            providerPaymentId: "pay_1",
            amountPaise: 12900,
            currency: "INR",
        });
    });
});
