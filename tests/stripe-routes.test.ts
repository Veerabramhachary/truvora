import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { POST } from "@/app/api/stripe/checkout/route";
import { GET } from "@/app/api/stripe/prices/route";

vi.mock("@clerk/nextjs/server", () => ({
    auth: vi.fn(),
    currentUser: vi.fn(),
}));

vi.mock("@/db", () => ({
    db: {},
}));

vi.mock("@/lib/stripe", () => ({
    getStripe: vi.fn(),
}));

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("Stripe checkout handler", () => {
    it("rejects unauthenticated requests", async () => {
        vi.mocked(auth).mockResolvedValue({ userId: null } as never);

        const response = await POST(
            new NextRequest("http://localhost/api/stripe/checkout", {
                method: "POST",
                body: "{}",
            }),
        );

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("keeps checkout disabled even for authenticated users", async () => {
        vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);

        const response = await POST(
            new NextRequest("http://localhost/api/stripe/checkout", {
                method: "POST",
                body: JSON.stringify({ planId: "f45a17b4-cc86-4de0-b56c-8af0c4ba4c34" }),
            }),
        );

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            error: "Payments are not available yet",
        });
        expect(getStripe).not.toHaveBeenCalled();
    });
});

describe("Stripe prices handler", () => {
    it("returns active prices from Stripe", async () => {
        const prices = [{ id: "price_123", currency: "inr" }];
        const list = vi.fn().mockResolvedValue({ data: prices });
        vi.mocked(getStripe).mockReturnValue({
            prices: { list },
        } as never);

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(prices);
        expect(list).toHaveBeenCalledWith({
            active: true,
            expand: ["data.product"],
        });
    });

    it("returns a generic error when Stripe price lookup fails", async () => {
        const list = vi.fn().mockRejectedValue(new Error("Stripe internals"));
        vi.mocked(getStripe).mockReturnValue({
            prices: { list },
        } as never);
        vi.spyOn(console, "error").mockImplementation(() => {});

        const response = await GET();

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            error: "Internal server error",
        });
    });
});
