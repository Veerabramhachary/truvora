import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createRazorpayRefund,
    fetchRazorpayPaymentRefunds,
    fetchRazorpayRefund,
    RazorpayError,
} from "@/lib/razorpay";

const config = {
    keyId: "rzp_test_key",
    keySecret: "test_secret",
    webhookSecret: null,
};

function response(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as Response;
}

function stubFetch() {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.SUPPORT_EMAIL;
});

describe("Razorpay refund API", () => {
    it("posts the amount in paise with the idempotency header and notes", async () => {
        const fetchMock = stubFetch();
        fetchMock.mockResolvedValue(
            response({
                id: "rfnd_1",
                payment_id: "pay_1",
                amount: 12900,
                currency: "INR",
                status: "processed",
            }),
        );

        const refund = await createRazorpayRefund(
            {
                paymentId: "pay_1",
                amountPaise: 12900,
                idempotencyKey: "rfnd-00000000-0000-4000-8000-000000000001",
                notes: { refundId: "refund-row-1" },
            },
            config,
        );

        expect(refund.id).toBe("rfnd_1");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.razorpay.com/v1/payments/pay_1/refund");
        expect(init?.method).toBe("POST");
        expect(
            (init?.headers as Record<string, string>)["X-Refund-Idempotency"],
        ).toBe("rfnd-00000000-0000-4000-8000-000000000001");
        expect(JSON.parse(String(init?.body))).toEqual({
            amount: 12900,
            speed: "normal",
            notes: { refundId: "refund-row-1" },
        });
    });

    it("reads a refund and a payment's refund list", async () => {
        const fetchMock = stubFetch();
        fetchMock
            .mockResolvedValueOnce(
                response({
                    id: "rfnd_1",
                    payment_id: "pay_1",
                    amount: 100,
                    currency: "INR",
                    status: "pending",
                }),
            )
            .mockResolvedValueOnce(
                response({
                    entity: [
                        {
                            id: "rfnd_1",
                            payment_id: "pay_1",
                            amount: 100,
                            currency: "INR",
                            status: "pending",
                        },
                    ],
                    count: 1,
                }),
            );

        await fetchRazorpayRefund("rfnd_1", config);
        const list = await fetchRazorpayPaymentRefunds("pay_1", config);

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://api.razorpay.com/v1/refunds/rfnd_1",
        );
        expect(fetchMock.mock.calls[1][0]).toBe(
            "https://api.razorpay.com/v1/payments/pay_1/refunds",
        );
        expect(list.count).toBe(1);
    });

    it("maps a permanent 400 to a safe code without leaking the provider body", async () => {
        const fetchMock = stubFetch();
        fetchMock.mockResolvedValue(
            response(
                {
                    error: {
                        code: "BAD_REQUEST_ERROR",
                        description: "Payment has already been fully refunded",
                    },
                },
                400,
            ),
        );
        vi.spyOn(console, "error").mockImplementation(() => {});

        const error = await createRazorpayRefund(
            {
                paymentId: "pay_1",
                amountPaise: 100,
                idempotencyKey: "rfnd-key-12345",
            },
            config,
        ).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(RazorpayError);
        expect(error).toMatchObject({
            status: 400,
            code: "BAD_REQUEST_ERROR",
            retryable: false,
            message: "Payment provider request failed",
        });
        expect(JSON.stringify(error)).not.toContain("fully refunded");
    });

    it("marks 5xx and in-progress 409 as retryable", async () => {
        const fetchMock = stubFetch();
        vi.spyOn(console, "error").mockImplementation(() => {});

        fetchMock.mockResolvedValueOnce(response({}, 500));
        await expect(
            createRazorpayRefund(
                {
                    paymentId: "pay_1",
                    amountPaise: 100,
                    idempotencyKey: "rfnd-key-12345",
                },
                config,
            ),
        ).rejects.toMatchObject({ status: 500, retryable: true });

        fetchMock.mockResolvedValueOnce(
            response(
                {
                    error: {
                        code: "BAD_REQUEST_ERROR",
                        description: "A refund with this idempotency key is in progress",
                    },
                },
                409,
            ),
        );
        await expect(
            createRazorpayRefund(
                {
                    paymentId: "pay_1",
                    amountPaise: 100,
                    idempotencyKey: "rfnd-key-12345",
                },
                config,
            ),
        ).rejects.toMatchObject({ status: 409, retryable: true });
    });

    it("marks network failures as retryable", async () => {
        const fetchMock = stubFetch();
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(
            fetchRazorpayRefund("rfnd_1", config),
        ).rejects.toMatchObject({ status: null, retryable: true });
    });
});
