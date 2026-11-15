import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    userId: "user_1" as string | null,
    orders: [
        {
            id: "order-1",
            planName: "Starter",
            amountPaid: "100.00",
            amountRefunded: "0.00",
            currency: "INR",
            paidAt: new Date("2026-11-01T00:00:00.000Z"),
            createdAt: new Date("2026-11-01T00:00:00.000Z"),
            refunds: [],
        },
    ],
}));

vi.mock("@clerk/nextjs/server", () => ({
    auth: vi.fn(async () => ({ userId: mocks.userId })),
}));

vi.mock("@/lib/payment-history", () => ({
    getPaymentHistory: vi.fn(async () => mocks.orders),
}));

import { GET } from "@/app/api/billing/payments/route";

beforeEach(() => {
    mocks.userId = "user_1";
});

describe("GET /api/billing/payments", () => {
    it("is 401 without a signed-in user", async () => {
        mocks.userId = null;

        expect((await GET()).status).toBe(401);
    });

    it("returns the signed-in user's history", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            orders: [{ id: "order-1", planName: "Starter" }],
        });
    });
});
