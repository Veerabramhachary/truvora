import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildReportPdf, pdfSafe, type PdfReportInput } from "@/lib/pdf-report";
import { summariseRecords } from "@/lib/report-summary";

const base = (over: Partial<PdfReportInput> = {}): PdfReportInput => ({
    title: "Transactions",
    ledgerName: "Personal",
    ledgerType: "personal",
    generatedLabel: "2026-11-04 10:30",
    level: "basic",
    filterLines: ["All records"],
    columns: [
        { header: "Date", width: 1.3 },
        { header: "Description", width: 4 },
        { header: "Amount", width: 2.4, align: "right" },
    ],
    rows: [["2026-11-01", "Coffee", "INR 120.00"]],
    ...over,
});

const manyRows = (n: number) =>
    Array.from({ length: n }, (_, i) => [`2026-11-${String((i % 28) + 1).padStart(2, "0")}`, `Item ${i + 1}`, "INR 10.00"]);

const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("pdfSafe", () => {
    it("keeps ASCII and Latin-1", () => {
        expect(pdfSafe("Café Müller & Co.")).toBe("Café Müller & Co.");
    });

    it("replaces what the standard fonts cannot draw", () => {
        expect(pdfSafe("₹500")).toBe("?500");
        expect(pdfSafe("नमस्ते")).toBe("??????");
        expect(pdfSafe("Lunch 🍕")).toBe("Lunch ?");
    });

    it("turns tabs and newlines into spaces", () => {
        expect(pdfSafe("a\tb\nc\r\nd")).toBe("a b c  d");
    });
});

describe("buildReportPdf", () => {
    it("produces a valid PDF", async () => {
        const bytes = await buildReportPdf(base());
        expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
        expect(await pageCount(bytes)).toBe(1);
    });

    it("never throws on characters the font cannot encode", async () => {
        await expect(
            buildReportPdf(
                base({
                    title: "Q3 ₹ report नमस्ते",
                    ledgerName: "Chai & चाय 🍵",
                    filterLines: ['Search: "₹ rent 🏠"'],
                    rows: [["2026-11-01", "Dinner 🍕 at Café ₹", "INR 1.00"]],
                }),
            ),
        ).resolves.toBeInstanceOf(Uint8Array);
    });

    it("breaks a long table across pages", async () => {
        const bytes = await buildReportPdf(base({ rows: manyRows(200) }));
        expect(await pageCount(bytes)).toBeGreaterThan(3);
    });

    it("handles no records and very long text", async () => {
        expect(await pageCount(await buildReportPdf(base({ rows: [] })))).toBe(1);
        const long = "x".repeat(2000);
        await expect(
            buildReportPdf(base({ rows: [["2026-11-01", long, "INR 1.00"]], ledgerName: long })),
        ).resolves.toBeInstanceOf(Uint8Array);
    });

    it("adds a truncation note", async () => {
        await expect(
            buildReportPdf(base({ truncatedNote: "Showing 2,000 of 5,310 records." })),
        ).resolves.toBeInstanceOf(Uint8Array);
    });

    it("the advanced level adds the summary sections", async () => {
        const summary = summariseRecords(
            [
                { type: "income", amount: "5000.00", currency: "INR", category: null, taxKind: "taxable_income" },
                { type: "expense", amount: "250.50", currency: "INR", category: "Food", taxKind: "deductible" },
                { type: "subscription", amount: "99.00", currency: "INR", category: "Software", taxKind: "tax_paid" },
            ],
            { includeTax: true },
        );
        const basic = await buildReportPdf(base({ ledgerType: "business" }));
        const advanced = await buildReportPdf(
            base({ ledgerType: "business", level: "advanced", summary }),
        );
        expect(advanced.length).toBeGreaterThan(basic.length);
    });

    it("ignores a summary at the basic level", async () => {
        const summary = summariseRecords(
            [{ type: "expense", amount: "10.00", currency: "INR", category: "Food" }],
            { includeTax: false },
        );
        const withSummary = await buildReportPdf(base({ level: "basic", summary }));
        const without = await buildReportPdf(base({ level: "basic" }));
        // Same content, so the file sizes match (only timestamps may differ slightly).
        expect(Math.abs(withSummary.length - without.length)).toBeLessThan(40);
    });
});
