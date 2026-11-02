import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type RenewalEmailPayload = {
    userName: string;
    subscriptions: { name: string; ledgerName: string; daysLeft: number }[];
};

const { sendMock, emailTemplateMock, dueMock } = vi.hoisted(() => ({
    sendMock: vi.fn(),
    emailTemplateMock: vi.fn((payload: RenewalEmailPayload) => payload),
    dueMock: vi.fn(),
}));

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: sendMock };
    },
}));
vi.mock("@/components/email-template", () => ({ EmailTemplate: emailTemplateMock }));
vi.mock("@/app/api/crons/subscriptionsTC/subscriptions", () => ({ SubscriptionsDue: dueMock }));
vi.mock("@/db", () => {
    const chain = (result: unknown): Record<string, unknown> => {
        const c: Record<string, unknown> = {};
        for (const key of ["values", "onConflictDoNothing", "set", "where"]) c[key] = () => c;
        c.returning = async () => result;
        return c;
    };
    return {
        db: {
            insert: () => chain([{ id: "delivery" }]),
            update: () => chain([]),
            transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
                fn({ update: () => chain([]) }),
        },
    };
});

import { GET } from "@/app/api/crons/subscriptionsTC/route";

const next = new Date("2026-11-04T10:00:00.000Z");
const row = (over: Record<string, unknown>) => ({
    id: "s",
    name: "Netflix",
    email: "a@example.com",
    firstName: "Asha",
    nextDate: next,
    userId: "user_a",
    ledgerName: "Personal",
    daysLeft: 3,
    ...over,
});

describe("renewal reminders", () => {
    const saved = { ...process.env };
    beforeEach(() => {
        process.env.CRON_SECRET = "s3cret";
        process.env.RESEND_API_KEY = "re_test";
        process.env.RENEWAL_EMAIL_FROM = "Truvora <no-reply@example.com>";
        sendMock.mockReset().mockResolvedValue({ error: null });
        emailTemplateMock.mockClear();
        dueMock.mockReset();
    });
    afterEach(() => {
        process.env = { ...saved };
    });

    const run = () =>
        GET(new NextRequest("http://localhost/api/crons/subscriptionsTC", {
            headers: { authorization: "Bearer s3cret" },
        }));

    it("sends ONE email per user, with every item tagged by its ledger name", async () => {
        dueMock.mockResolvedValue([
            row({ id: "1", name: "Netflix", ledgerName: "Personal", daysLeft: 3 }),
            row({ id: "2", name: "Figma", ledgerName: "My Shop", daysLeft: 1 }),
            row({ id: "3", name: "Spotify", ledgerName: "Personal", userId: "user_b", email: "b@example.com", firstName: "Bo" }),
        ]);

        const res = await run();
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, sent: 2, failed: 0 });
        expect(sendMock).toHaveBeenCalledTimes(2);

        const forA = emailTemplateMock.mock.calls
            .map((c) => c[0] as { userName: string; subscriptions: { name: string; ledgerName: string; daysLeft: number }[] })
            .find((arg) => arg.userName === "Asha")!;
        // Soonest first, each with its own ledger name.
        expect(forA.subscriptions).toEqual([
            { name: "Figma", ledgerName: "My Shop", daysLeft: 1 },
            { name: "Netflix", ledgerName: "Personal", daysLeft: 3 },
        ]);
    });

    it("does not look at the user's plan: a user with no paid plan still gets reminded", async () => {
        // The query result carries no plan information at all; if the route
        // needed one it could not send.
        dueMock.mockResolvedValue([row({})]);
        const res = await run();
        expect(await res.json()).toMatchObject({ sent: 1 });
        expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("is 503 when email is not configured and 401 without the secret", async () => {
        delete process.env.RESEND_API_KEY;
        expect((await run()).status).toBe(503);
        const res = await GET(new NextRequest("http://localhost/api/crons/subscriptionsTC"));
        expect(res.status).toBe(401);
    });
});

describe("reminder query has no paid-plan requirement", () => {
    const source = readFileSync("app/api/crons/subscriptionsTC/subscriptions.ts", "utf8");
    it("does not reference plans or billing subscriptions", () => {
        expect(source).not.toMatch(/app_subscriptions|schema\/plans|plans\.price|paidPlan/);
    });
    it("uses the shared active condition and joins the ledger name", () => {
        expect(source).toContain("activeSubscriptionNow");
        expect(source).toMatch(/ledgerName:\s*ledgers\.name/);
    });
});
