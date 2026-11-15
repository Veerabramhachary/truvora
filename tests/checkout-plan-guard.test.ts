import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    billing: null as unknown,
    createOrder: vi.fn(),
    fulfill: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
    auth: vi.fn(async () => ({ userId: "user_1" })),
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimits: vi.fn(async () => null),
    rateLimitResponse: vi.fn(() => null),
}));

vi.mock("@/lib/billing-state", () => ({
    getBillingState: vi.fn(async () => mocks.billing),
}));

vi.mock("@/lib/payment-fulfillment", () => ({
    fulfillPaymentOrder: mocks.fulfill,
}));

vi.mock("@/lib/razorpay", () => ({
    RazorpayError: class RazorpayError extends Error {},
    getRazorpayConfig: () => ({
        keyId: "rzp_test",
        keySecret: "secret",
        webhookSecret: null,
    }),
    buildRazorpayReceipt: () => "trv_test",
    createRazorpayOrder: mocks.createOrder,
}));

// The route reads the plan, then the user's pending discount, then billing.
// Two queue entries keep the discount lookup empty.
const dbMock = vi.hoisted(() => {
    let queue: unknown[][] = [];

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
        chain,
        setQueue: (next: unknown[][]) => {
            queue = next;
        },
        insert: vi.fn(() => ({ values: async () => undefined })),
    };
});

vi.mock("@/db", () => ({
    db: {
        select: vi.fn(() => dbMock.chain()),
        insert: dbMock.insert,
    },
}));

import { POST } from "@/app/api/payments/razorpay/order/route";

const PLAN_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_PLAN_ID = "00000000-0000-4000-8000-000000000002";

function planRow(overrides: Record<string, unknown> = {}) {
    return {
        id: PLAN_ID,
        name: "Starter",
        price: "100.00",
        currency: "INR",
        interval: "month",
        intervalCount: 1,
        isActive: true,
        provider: "razorpay",
        ...overrides,
    };
}

const post = (planId = PLAN_ID) =>
    POST(
        new NextRequest("http://localhost/api/payments/razorpay/order", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ planId }),
        }),
    );

beforeEach(() => {
    mocks.billing = {
        status: "free",
        plan: null,
        subscriptionPlan: null,
        subscription: null,
        currentPeriodEnd: null,
        fundingOrderId: null,
    };
    mocks.createOrder.mockReset();
    mocks.fulfill.mockReset();
    dbMock.insert.mockClear();
    dbMock.setQueue([]);
});

describe("checkout plan-switch guard", () => {
    it("blocks a different plan while a paid period is active", async () => {
        mocks.billing = {
            status: "paid",
            plan: { id: PLAN_ID },
            fundingOrderId: "order-current",
        };
        dbMock.setQueue([[planRow({ id: OTHER_PLAN_ID })], []]);

        const response = await post(OTHER_PLAN_ID);
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.code).toBe("PLAN_CHANGE_REQUIRES_CANCEL");
        expect(mocks.createOrder).not.toHaveBeenCalled();
        expect(mocks.fulfill).not.toHaveBeenCalled();
    });

    it("still reports the same plan as already active", async () => {
        mocks.billing = {
            status: "paid",
            plan: { id: PLAN_ID },
            fundingOrderId: "order-current",
        };
        dbMock.setQueue([[planRow()], []]);

        const response = await post();

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
            error: "You are already on this plan.",
        });
        expect(mocks.createOrder).not.toHaveBeenCalled();
    });

    it("does not let a ₹0 plan replace a paid plan", async () => {
        mocks.billing = {
            status: "paid",
            plan: { id: PLAN_ID },
            fundingOrderId: "order-current",
        };
        dbMock.setQueue([
            [planRow({ id: OTHER_PLAN_ID, price: "0.00", provider: "none" })],
            [],
        ]);

        const response = await post(OTHER_PLAN_ID);

        expect(response.status).toBe(409);
        expect(mocks.fulfill).not.toHaveBeenCalled();
    });

    it("allows a Free user to buy a plan", async () => {
        dbMock.setQueue([[planRow()], [], [{ firstName: "A", email: "a@b.c" }]]);
        mocks.createOrder.mockResolvedValue({
            id: "order_1",
            amount: 10000,
            currency: "INR",
        });

        const response = await post();

        expect(response.status).toBe(200);
        expect(mocks.createOrder).toHaveBeenCalledTimes(1);
    });
});
