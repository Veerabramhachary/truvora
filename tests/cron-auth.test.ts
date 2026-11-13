import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeCron, safeEqual } from "@/lib/cron-auth";

const request = (authorization?: string) =>
    new Request("http://localhost/api/crons/test", {
        headers: authorization === undefined ? {} : { authorization },
    });

describe("safeEqual", () => {
    it("matches identical strings and rejects different ones", () => {
        expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
        expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    });

    it("does not throw on different lengths or empty input", () => {
        expect(safeEqual("short", "a much longer value")).toBe(false);
        expect(safeEqual("", "Bearer abc")).toBe(false);
        expect(safeEqual("", "")).toBe(true);
    });
});

describe("authorizeCron", () => {
    const original = process.env.CRON_SECRET;
    beforeEach(() => {
        process.env.CRON_SECRET = "s3cret";
    });
    afterEach(() => {
        if (original === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = original;
    });

    it("is 503 when CRON_SECRET is not configured, even with a header", async () => {
        delete process.env.CRON_SECRET;
        const denied = authorizeCron(request("Bearer s3cret"));
        expect(denied?.status).toBe(503);
    });

    it("is 401 without a header, with a wrong token, or with a different scheme", () => {
        expect(authorizeCron(request())?.status).toBe(401);
        expect(authorizeCron(request("Bearer nope"))?.status).toBe(401);
        expect(authorizeCron(request("Bearer s3cret-and-more"))?.status).toBe(401);
        expect(authorizeCron(request("Basic s3cret"))?.status).toBe(401);
        expect(authorizeCron(request("s3cret"))?.status).toBe(401);
    });

    it("returns null for the correct bearer token", () => {
        expect(authorizeCron(request("Bearer s3cret"))).toBeNull();
    });
});
