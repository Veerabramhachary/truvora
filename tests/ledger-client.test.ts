import { afterEach, describe, expect, it, vi } from "vitest";
import { LEDGER_HEADER } from "@/lib/ledger-header";
import {
    ledgerFetch,
    ledgerHttpClient,
    setActiveLedgerId,
    getActiveLedgerId,
} from "@/lib/ledger-client";

const LEDGER_ID = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
    setActiveLedgerId(null);
    vi.restoreAllMocks();
});

describe("ledgerFetch", () => {
    it("adds the active ledger header", async () => {
        const fetchMock = vi.fn(async () => new Response("{}"));
        vi.stubGlobal("fetch", fetchMock);
        setActiveLedgerId(LEDGER_ID);

        await ledgerFetch("/api/export?type=expenses");

        const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
        expect(new Headers(init.headers).get(LEDGER_HEADER)).toBe(LEDGER_ID);
    });

    it("sends no header before a ledger is chosen, so the server uses Personal", async () => {
        const fetchMock = vi.fn(async () => new Response("{}"));
        vi.stubGlobal("fetch", fetchMock);

        await ledgerFetch("/api/export?type=expenses");

        const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
        expect(new Headers(init.headers).has(LEDGER_HEADER)).toBe(false);
    });

    it("keeps caller headers and does not override an explicit ledger header", async () => {
        const fetchMock = vi.fn(async () => new Response("{}"));
        vi.stubGlobal("fetch", fetchMock);
        setActiveLedgerId(LEDGER_ID);

        await ledgerFetch("/api/categories", {
            headers: { "Content-Type": "application/json", [LEDGER_HEADER]: "explicit" },
        });

        const headers = new Headers(
            (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
        );
        expect(headers.get("content-type")).toBe("application/json");
        expect(headers.get(LEDGER_HEADER)).toBe("explicit");
    });
});

describe("ledgerHttpClient (Refine)", () => {
    async function headerSeenByServer() {
        const response = await ledgerHttpClient.get("/probe", {
            adapter: async (config) => ({
                data: String(config.headers.get(LEDGER_HEADER) ?? ""),
                status: 200,
                statusText: "OK",
                headers: {},
                config,
            }),
        });
        return response.data as string;
    }

    it("sends the ledger that is active at request time", async () => {
        setActiveLedgerId(LEDGER_ID);
        expect(await headerSeenByServer()).toBe(LEDGER_ID);

        setActiveLedgerId("33333333-3333-4333-8333-333333333333");
        expect(await headerSeenByServer()).toBe("33333333-3333-4333-8333-333333333333");
    });

    it("sends nothing when no ledger is active", async () => {
        expect(getActiveLedgerId()).toBeNull();
        expect(await headerSeenByServer()).toBe("");
    });
});
