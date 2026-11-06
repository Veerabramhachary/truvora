import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    verifyRazorpayPaymentSignature,
    verifyRazorpayWebhookSignature,
} from "@/lib/razorpay";

const SECRET = "test_key_secret";

function paymentSignature(orderId: string, paymentId: string, secret = SECRET) {
    return createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
}

function webhookSignature(rawBody: string, secret = SECRET) {
    return createHmac("sha256", secret).update(rawBody).digest("hex");
}

describe("Razorpay signature verification", () => {
    it("accepts a correctly signed order/payment pair", () => {
        const orderId = "order_123";
        const paymentId = "pay_456";

        expect(
            verifyRazorpayPaymentSignature({
                orderId,
                paymentId,
                signature: paymentSignature(orderId, paymentId),
                secret: SECRET,
            }),
        ).toBe(true);
    });

    it("rejects a tampered payment id or order id", () => {
        const signature = paymentSignature("order_123", "pay_456");

        expect(
            verifyRazorpayPaymentSignature({
                orderId: "order_123",
                paymentId: "pay_tampered",
                signature,
                secret: SECRET,
            }),
        ).toBe(false);

        expect(
            verifyRazorpayPaymentSignature({
                orderId: "order_tampered",
                paymentId: "pay_456",
                signature,
                secret: SECRET,
            }),
        ).toBe(false);
    });

    it("rejects a signature made with a different secret", () => {
        const signature = paymentSignature("order_123", "pay_456", "wrong_secret");

        expect(
            verifyRazorpayPaymentSignature({
                orderId: "order_123",
                paymentId: "pay_456",
                signature,
                secret: SECRET,
            }),
        ).toBe(false);
    });

    it("rejects malformed signatures instead of throwing", () => {
        for (const signature of ["", "not-hex", "abcd", "0".repeat(64)]) {
            expect(
                verifyRazorpayPaymentSignature({
                    orderId: "order_123",
                    paymentId: "pay_456",
                    signature,
                    secret: SECRET,
                }),
            ).toBe(false);
        }
    });

    it("verifies the raw webhook body and rejects re-serialised JSON", () => {
        const rawBody = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_456"}}}}';
        const signature = webhookSignature(rawBody);

        expect(
            verifyRazorpayWebhookSignature({
                rawBody,
                signature,
                secret: SECRET,
            }),
        ).toBe(true);

        const reSerialised = JSON.stringify(JSON.parse(rawBody), null, 2);
        expect(
            verifyRazorpayWebhookSignature({
                rawBody: reSerialised,
                signature,
                secret: SECRET,
            }),
        ).toBe(false);
    });
});
