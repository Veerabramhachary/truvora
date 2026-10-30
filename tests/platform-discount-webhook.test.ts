import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhooks/stripe/route";
import { updatePlatformDiscountRedemption } from "@/lib/platform-discounts";

const mocks = vi.hoisted(() => ({
    event: null as unknown,
    updateRedemption: vi.fn(),
}));

vi.mock("@/db", () => ({
    db: {
        update: vi.fn(() => ({
            set: () => ({
                where: () => ({
                    returning: async () => [{ id: "user_123" }],
                }),
            }),
        })),
    },
}));

vi.mock("@/lib/stripe", () => ({
    getStripe: vi.fn(() => ({
        webhooks: {
            constructEvent: vi.fn(() => mocks.event),
        },
    })),
}));

vi.mock("@/lib/platform-discounts", () => ({
    updatePlatformDiscountRedemption: mocks.updateRedemption,
}));

function checkoutEvent(
    type: string,
    overrides: Record<string, unknown> = {},
) {
    mocks.event = {
        type,
        data: {
            object: {
                id: "cs_test_123",
                client_reference_id: "user_123",
                customer: "cus_test_123",
                payment_status: "paid",
                metadata: { discountRedemptionId: "redemption_123" },
                ...overrides,
            },
        },
    };
}

async function postWebhook() {
    return POST(
        new NextRequest("http://localhost/api/webhooks/stripe", {
            method: "POST",
            body: "{}",
            headers: { "stripe-signature": "test_signature" },
        }),
    );
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("Stripe campaign redemption lifecycle", () => {
    it("redeems the reserved slot only after checkout is paid", async () => {
        checkoutEvent("checkout.session.completed");

        const response = await postWebhook();

        expect(response.status).toBe(200);
        expect(updatePlatformDiscountRedemption).toHaveBeenCalledWith(
            "redemption_123",
            "cs_test_123",
            "redeemed",
        );
    });

    it("keeps an unpaid checkout reservation until payment or expiry", async () => {
        checkoutEvent("checkout.session.completed", {
            payment_status: "unpaid",
        });

        const response = await postWebhook();

        expect(response.status).toBe(200);
        expect(updatePlatformDiscountRedemption).not.toHaveBeenCalled();
    });

    it("releases a reservation when Stripe expires its checkout session", async () => {
        checkoutEvent("checkout.session.expired");

        const response = await postWebhook();

        expect(response.status).toBe(200);
        expect(updatePlatformDiscountRedemption).toHaveBeenCalledWith(
            "redemption_123",
            "cs_test_123",
            "released",
        );
    });

    it("redeems asynchronous payments after Stripe confirms success", async () => {
        checkoutEvent("checkout.session.async_payment_succeeded");

        const response = await postWebhook();

        expect(response.status).toBe(200);
        expect(updatePlatformDiscountRedemption).toHaveBeenCalledWith(
            "redemption_123",
            "cs_test_123",
            "redeemed",
        );
    });
});
