import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/billing-state", () => ({ getBillingState: vi.fn() }));
vi.mock("@/lib/razorpay", () => ({
    createRazorpayRefund: vi.fn(),
    getRazorpayConfig: vi.fn(),
    RazorpayError: class extends Error {},
}));
vi.mock("@/lib/refund-emails", () => ({ sendRefundConfirmation: vi.fn() }));
vi.mock("@/lib/refund-fulfillment", () => ({
    applyProviderRefund: vi.fn(),
    refundStatusFromProvider: vi.fn(),
}));

import { lastUserRefundAt } from "@/lib/refund-service";

/**
 * R-04: the 90-day limit must see a refund that is still pending, otherwise a
 * user can cancel, buy again and cancel again before the first one settles.
 * The mock records the WHERE clause so the filter itself is checked, not just
 * the value the database would return.
 */
describe("lastUserRefundAt", () => {
    function readerReturning(rows: Array<{ createdAt: Date }>) {
        let captured: SQL | undefined;
        const reader = {
            select: () => ({
                from: () => ({
                    where: (condition: SQL) => {
                        captured = condition;
                        return {
                            orderBy: () => ({ limit: async () => rows }),
                        };
                    },
                }),
            }),
        };
        return { reader, condition: () => captured };
    }

    it("counts requested, pending and processed refunds the user asked for", async () => {
        const { reader, condition } = readerReturning([]);

        await lastUserRefundAt(reader as never, "user_1");

        const query = new PgDialect().sqlToQuery(condition() as SQL);
        expect(query.params).toEqual(
            expect.arrayContaining([
                "user_1",
                "user",
                "requested",
                "pending",
                "processed",
            ]),
        );
        // Failed refunds never counted; they must not start counting now.
        expect(query.params).not.toContain("failed");
        // Support and dashboard refunds must not lock the user out.
        expect(query.params).not.toContain("ops");
        expect(query.params).not.toContain("provider");
    });

    it("returns when the latest counted refund was created", async () => {
        const createdAt = new Date("2026-11-01T00:00:00.000Z");
        const { reader } = readerReturning([{ createdAt }]);

        await expect(lastUserRefundAt(reader as never, "user_1")).resolves.toEqual(
            createdAt,
        );
    });

    it("returns null when there is none", async () => {
        const { reader } = readerReturning([]);

        await expect(
            lastUserRefundAt(reader as never, "user_1"),
        ).resolves.toBeNull();
    });
});
