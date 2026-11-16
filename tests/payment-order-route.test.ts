import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
    let queue: unknown[][] = [];
    const chain = () => {
        const result: Record<string, unknown> = {
            from: () => result,
            where: () => result,
            limit: () => result,
            then: (
                resolve: (value: unknown) => unknown,
                reject: (reason: unknown) => unknown,
            ) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
        };
        return result;
    };
    return {
        setQueue: (next: unknown[][]) => {
            queue = next;
        },
        select: vi.fn(() => chain()),
        insertValues: vi.fn(async () => undefined),
        billing: vi.fn(),
        createOrder: vi.fn(),
        fulfill: vi.fn(),
    };
});

vi.mock("@clerk/nextjs/server", () => ({
    auth: async () => ({ userId: "user_1" }),
}));
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimits: async () => null,
    rateLimitResponse: () => null,
}));
vi.mock("@/db", () => ({
    db: {
        select: mocks.select,
        insert: () => ({ values: mocks.insertValues }),
    },
}));
vi.mock("@/lib/billing-state", () => ({ getBillingState: mocks.billing }));
vi.mock("@/lib/payment-fulfillment", () => ({
    fulfillPaymentOrder: mocks.fulfill,
}));
vi.mock("@/lib/razorpay", () => ({
    buildRazorpayReceipt: () => "trv_receipt",
    createRazorpayOrder: mocks.createOrder,
    getRazorpayConfig: () => ({ keyId: "rzp_test", keySecret: "secret" }),
    RazorpayError: class extends Error {},
}));

import { POST } from "@/app/api/payments/razorpay/order/route";

const PLAN_ID = "00000000-0000-4000-8000-000000000001";

function planRow(overrides: Record<string, unknown> = {}) {
    return {
        id: PLAN_ID,
        name: "Starter",
        price: "129.00",
        currency: "INR",
        interval: "month",
        intervalCount: 1,
        provider: "razorpay",
        isActive: true,
        ...overrides,
    };
}

function request() {
    return new NextRequest("http://localhost/api/payments/razorpay/order", {
        method: "POST",
        body: JSON.stringify({ planId: PLAN_ID }),
    });
}

beforeEach(() => {
    mocks.setQueue([]);
    mocks.select.mockClear();
    mocks.insertValues.mockClear();
    mocks.billing.mockReset();
    mocks.createOrder.mockReset();
    mocks.fulfill.mockReset();
});

describe("POST /api/payments/razorpay/order plan guards", () => {
    it("never creates a checkout for the Free plan (R-05)", async () => {
        mocks.setQueue([[planRow({ price: "0.00", provider: "none" })]]);

        const response = await POST(request());

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            code: "PLAN_NOT_PURCHASABLE",
        });
        expect(mocks.billing).not.toHaveBeenCalled();
        expect(mocks.createOrder).not.toHaveBeenCalled();
        expect(mocks.fulfill).not.toHaveBeenCalled();
        expect(mocks.insertValues).not.toHaveBeenCalled();
    });

    it("rejects the plan the user is already on", async () => {
        mocks.setQueue([[planRow()]]);
        mocks.billing.mockResolvedValue({
            status: "paid",
            plan: { id: PLAN_ID },
        });

        const response = await POST(request());

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toMatchObject({
            code: "ALREADY_ON_PLAN",
        });
        expect(mocks.createOrder).not.toHaveBeenCalled();
    });

    it("blocks switching plans while a paid period is active (D12)", async () => {
        mocks.setQueue([[planRow()]]);
        mocks.billing.mockResolvedValue({
            status: "paid",
            plan: { id: "another-plan" },
        });

        const response = await POST(request());

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toMatchObject({
            code: "PLAN_CHANGE_REQUIRES_CANCEL",
        });
        expect(mocks.createOrder).not.toHaveBeenCalled();
        expect(mocks.insertValues).not.toHaveBeenCalled();
    });

    it("still lets a Free user start a paid checkout", async () => {
        // plan, pending discount redemption (none), profile
        mocks.setQueue([
            [planRow()],
            [],
            [{ firstName: "Asha", email: "asha@example.com" }],
        ]);
        mocks.billing.mockResolvedValue({
            status: "free",
            plan: { id: "free-plan" },
        });
        mocks.createOrder.mockResolvedValue({
            id: "order_1",
            amount: 12900,
            currency: "INR",
        });

        const response = await POST(request());

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            orderId: "order_1",
            amount: 12900,
        });
        expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    });

    it("lets a user whose paid period ended buy the same plan again", async () => {
        mocks.setQueue([
            [planRow()],
            [],
            [{ firstName: "Asha", email: "asha@example.com" }],
        ]);
        // An expired paid plan resolves to the Free plan for entitlements.
        mocks.billing.mockResolvedValue({
            status: "expired",
            plan: { id: "free-plan" },
        });
        mocks.createOrder.mockResolvedValue({
            id: "order_2",
            amount: 12900,
            currency: "INR",
        });

        const response = await POST(request());

        expect(response.status).toBe(200);
    });
});
