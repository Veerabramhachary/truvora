import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { POST } from "@/app/api/webhooks/clerk/route";
import { app_subscriptions } from "@/db/schema/plans";
import { subscriptions } from "@/db/schema/schema";
import { reminderDeliveries } from "@/db/schema/reminder-deliveries";
import { users } from "@/db/schema/users";

const mocks = vi.hoisted(() => ({ event: null as unknown }));

vi.mock("svix", () => ({
    Webhook: vi.fn().mockImplementation(() => ({
        verify: vi.fn(() => mocks.event),
    })),
}));

vi.mock("next/headers", () => ({
    headers: vi.fn(async () => new Headers({
        "svix-id": "msg_test",
        "svix-timestamp": "1700000000",
        "svix-signature": "signature",
    })),
}));

vi.mock("@/db", () => ({
    db: { transaction: vi.fn() },
}));

const USER_ID = "user_deleted";
const OWN_SUBSCRIPTION_IDS = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
];

function deletionEvent() {
    return { type: "user.deleted", data: { id: USER_ID } };
}

function createTransactionMock(options?: { failReminderDelete?: boolean }) {
    let transactionCount = 0;
    const deleteCalls: Array<{ table: unknown; condition?: unknown }> = [];
    const selectionConditions: Array<{ table: unknown; condition: unknown }> = [];

    const tx = {
        select: vi.fn(() => ({
            from: (table: unknown) => ({
                where: async (condition: unknown) => {
                    selectionConditions.push({ table, condition });
                    if (table === app_subscriptions) return [];
                    if (table === subscriptions) {
                        return transactionCount === 1
                            ? OWN_SUBSCRIPTION_IDS.map((id) => ({ id }))
                            : [];
                    }
                    return [];
                },
            }),
        })),
        delete: vi.fn((table: unknown) => ({
            where: async (condition: unknown) => {
                deleteCalls.push({ table, condition });
                if (table === reminderDeliveries && options?.failReminderDelete) {
                    throw new Error("database unavailable");
                }
                return [];
            },
        })),
        update: vi.fn(),
    };

    vi.mocked(db.transaction).mockImplementation(async (callback) => {
        transactionCount += 1;
        return (callback as unknown as (transaction: typeof tx) => Promise<unknown>)(tx) as never;
    });

    return { tx, deleteCalls, selectionConditions };
}

async function sendDeletionWebhook() {
    const request = new NextRequest("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: JSON.stringify(deletionEvent()),
    });
    return POST(request);
}

afterEach(() => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    if (vi.isMockFunction(console.error)) {
        vi.mocked(console.error).mockRestore();
    }
    vi.clearAllMocks();
});

describe("Clerk account deletion cleanup", () => {
    it("deletes reminder deliveries for only the deleted user's subscriptions", async () => {
        process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
        mocks.event = deletionEvent();
        const { deleteCalls, selectionConditions } = createTransactionMock();

        const response = await sendDeletionWebhook();

        expect(response.status).toBe(200);
        const subscriptionSelection = selectionConditions.find(
            ({ table }) => table === subscriptions,
        );
        expect(subscriptionSelection).toBeDefined();
        expect(new PgDialect().sqlToQuery(subscriptionSelection!.condition as never).params)
            .toContain(USER_ID);

        const reminderDelete = deleteCalls.find(({ table }) => table === reminderDeliveries);
        expect(reminderDelete).toBeDefined();
        const reminderDeleteParams = new PgDialect()
            .sqlToQuery(reminderDelete!.condition as never).params;
        expect(reminderDeleteParams).toEqual(expect.arrayContaining(OWN_SUBSCRIPTION_IDS));
        expect(reminderDeleteParams).not.toContain("another_user_subscription");
        expect(deleteCalls.findIndex(({ table }) => table === reminderDeliveries))
            .toBeLessThan(deleteCalls.findIndex(({ table }) => table === subscriptions));
    });

    it("succeeds when retried after the account and subscriptions are already gone", async () => {
        process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
        mocks.event = deletionEvent();
        const { deleteCalls } = createTransactionMock();

        const firstResponse = await sendDeletionWebhook();
        const secondResponse = await sendDeletionWebhook();

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(deleteCalls.filter(({ table }) => table === reminderDeliveries)).toHaveLength(1);
    });

    it("returns 500 when reminder cleanup fails so Clerk can retry", async () => {
        process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
        mocks.event = deletionEvent();
        const { deleteCalls } = createTransactionMock({ failReminderDelete: true });
        vi.spyOn(console, "error").mockImplementation(() => {});

        const response = await sendDeletionWebhook();

        expect(response.status).toBe(500);
        expect(deleteCalls.some(({ table }) => table === users)).toBe(false);
    });
});
