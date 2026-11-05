import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
    urls: [] as string[],
    response: null as Response | null,
}));

vi.mock("@/lib/ledger-client", () => ({
    ledgerFetch: async (url: string) => {
        m.urls.push(url);
        return m.response!;
    },
}));

import { downloadExport } from "@/lib/export-client";

const clicked: { href: string; download: string }[] = [];

describe("downloadExport", () => {
    beforeEach(() => {
        m.urls = [];
        clicked.length = 0;
        m.response = new Response("data", {
            status: 200,
            headers: { "Content-Disposition": 'attachment; filename="truvora-business-transactions-2026-11-04.pdf"' },
        });
        const link = {
            href: "",
            download: "",
            click() {
                clicked.push({ href: this.href, download: this.download });
            },
        };
        vi.stubGlobal("window", {
            URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => undefined },
        });
        vi.stubGlobal("document", {
            createElement: () => link,
            body: { appendChild: () => undefined, removeChild: () => undefined },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const params = () => new URL(`http://x${m.urls[0]}`).searchParams;

    it("asks for the source and format and sends the time zone", async () => {
        await downloadExport({ source: "transactions", format: "pdf" });
        expect(m.urls[0]).toMatch(/^\/api\/export\?/);
        expect(params().get("type")).toBe("transactions");
        expect(params().get("format")).toBe("pdf");
        expect(params().get("tzOffset")).toBe(String(new Date().getTimezoneOffset()));
    });

    it("sends the list filters, and a type filter does NOT replace the export source", async () => {
        await downloadExport({
            source: "expenses",
            format: "csv",
            filters: [
                { field: "q", operator: "eq", value: "rent" },
                { field: "type", operator: "eq", value: "expense" },
                { field: "minAmount", operator: "eq", value: "10" },
                { field: "categoryId", operator: "eq", value: "" },
            ],
        });
        expect(params().get("type")).toBe("expenses");
        expect(params().get("recordType")).toBe("expense");
        expect(params().get("q")).toBe("rent");
        expect(params().get("minAmount")).toBe("10");
        expect(params().has("categoryId")).toBe(false);
    });

    it("saves the file under the name the server chose", async () => {
        await downloadExport({ source: "transactions", format: "pdf" });
        expect(clicked).toEqual([
            { href: "blob:test", download: "truvora-business-transactions-2026-11-04.pdf" },
        ]);
    });

    it("falls back to a sensible file name", async () => {
        m.response = new Response("data", { status: 200 });
        await downloadExport({ source: "subscriptions", format: "csv" });
        expect(clicked[0].download).toBe("subscriptions.csv");
    });

    it("shows the server's own reason when the export is refused", async () => {
        m.response = new Response(JSON.stringify({ error: "PDF export is not included in your plan" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
        await expect(downloadExport({ source: "transactions", format: "pdf" })).rejects.toThrow(
            "PDF export is not included in your plan",
        );
        expect(clicked).toHaveLength(0);
    });

    it("uses a generic message when the server gave none", async () => {
        m.response = new Response("nope", { status: 500 });
        await expect(downloadExport({ source: "expenses", format: "csv" })).rejects.toThrow(
            /Could not export expenses as CSV/,
        );
    });
});
