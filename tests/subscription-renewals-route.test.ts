import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const processSubscriptionRenewals = vi.fn();
vi.mock("@/lib/subscription-renewals", () => ({
    processSubscriptionRenewals: (...args: unknown[]) => processSubscriptionRenewals(...args),
}));

import { GET } from "@/app/api/crons/subscription-renewals/route";

const call = (headers: Record<string, string> = {}, query = "") =>
    GET(new NextRequest(`http://localhost/api/crons/subscription-renewals${query}`, { headers }));

describe("renewal cron route", () => {
    const original = process.env.CRON_SECRET;
    beforeEach(() => {
        process.env.CRON_SECRET = "s3cret";
        processSubscriptionRenewals.mockReset();
    });
    afterEach(() => {
        if (original === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = original;
    });

    it("is 503 when CRON_SECRET is not configured", async () => {
        delete process.env.CRON_SECRET;
        expect((await call()).status).toBe(503);
        expect(processSubscriptionRenewals).not.toHaveBeenCalled();
    });

    it("is 401 without the right bearer token", async () => {
        expect((await call()).status).toBe(401);
        expect((await call({ authorization: "Bearer nope" })).status).toBe(401);
        expect(processSubscriptionRenewals).not.toHaveBeenCalled();
    });

    it("runs the job and reports the summary", async () => {
        processSubscriptionRenewals.mockResolvedValue({ failed: 0, recorded: 3 });
        const res = await call({ authorization: "Bearer s3cret" });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, recorded: 3 });
        expect(processSubscriptionRenewals).toHaveBeenCalledWith({ dryRun: false });
    });

    it("passes dryRun=1 through", async () => {
        processSubscriptionRenewals.mockResolvedValue({ failed: 0 });
        await call({ authorization: "Bearer s3cret" }, "?dryRun=1");
        expect(processSubscriptionRenewals).toHaveBeenCalledWith({ dryRun: true });
    });

    it("is 500 when any subscription failed, so the scheduler notices", async () => {
        processSubscriptionRenewals.mockResolvedValue({ failed: 2 });
        expect((await call({ authorization: "Bearer s3cret" })).status).toBe(500);
    });
});
