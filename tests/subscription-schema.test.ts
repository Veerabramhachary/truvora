import { describe, expect, it } from "vitest";
import { subscriptionSchema } from "@/app/api/subscriptions/schema";

const validSubscription = {
    name: "Streaming",
    price: "12.50",
    currency: "USD",
    interval: "month",
    startDate: "2026-10-25",
    category: "Entertainment",
};

describe("subscription interval count validation", () => {
    it.each([0, -1, 1.5])("rejects invalid intervalCount %s", (intervalCount) => {
        expect(
            subscriptionSchema.safeParse({ ...validSubscription, intervalCount }).success,
        ).toBe(false);
    });

    it("accepts a positive integer intervalCount", () => {
        expect(
            subscriptionSchema.safeParse({
                ...validSubscription,
                intervalCount: 3,
            }).success,
        ).toBe(true);
    });

    it("allows intervalCount to be omitted", () => {
        expect(subscriptionSchema.safeParse(validSubscription).success).toBe(true);
    });
});
