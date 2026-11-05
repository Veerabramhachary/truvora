import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, type ReportSummary } from "@/lib/report-summary";

/**
 * PDF export (F-05). Plain tables on A4 with the standard Helvetica font, so
 * nothing has to be bundled or downloaded. Two levels:
 *
 *   basic     header + the table of records (Starter)
 *   advanced  the same, preceded by a summary: totals, spending by category
 *             and, for business ledgers, the tax summary (Pro)
 *
 * The standard fonts only cover Latin-1. Anything outside it (the rupee sign,
 * Devanagari, emoji) would make pdf-lib throw, so text is cleaned first and
 * unsupported characters become "?". Amounts use the currency code ("INR ..").
 */

export type PdfColumn = { header: string; width: number; align?: "left" | "right" };

export type PdfReportInput = {
    title: string;
    ledgerName: string;
    ledgerType: "personal" | "business";
    /** Already formatted for display, in the user's time zone. */
    generatedLabel: string;
    level: "basic" | "advanced";
    filterLines: string[];
    columns: PdfColumn[];
    rows: string[][];
    /** Advanced level only. */
    summary?: ReportSummary;
    /** e.g. "Showing the first 2,000 of 5,310 records." */
    truncatedNote?: string;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const FOOTER_SPACE = 28;
const ROW_HEIGHT = 16;
const FONT_SIZE = 8.5;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const GREEN = rgb(0.09, 0.5, 0.25);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const HEADER_FILL = rgb(0.92, 0.96, 0.93);
const ZEBRA_FILL = rgb(0.972, 0.976, 0.972);
const RULE = rgb(0.82, 0.85, 0.83);

/** Keep ASCII and Latin-1 (what the standard fonts encode); everything else becomes "?". */
export function pdfSafe(value: string): string {
    let out = "";
    for (const ch of value) {
        const code = ch.codePointAt(0)!;
        if (code === 9 || code === 10 || code === 13) out += " ";
        else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) out += ch;
        else out += "?";
    }
    return out;
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
    let safe = pdfSafe(text);
    if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
    const ellipsis = "...";
    while (safe.length > 0 && font.widthOfTextAtSize(safe + ellipsis, size) > maxWidth) {
        safe = safe.slice(0, -1);
    }
    return safe + ellipsis;
}

const money = (value: bigint, currency: string) => formatMoney(value, currency);

export async function buildReportPdf(input: PdfReportInput): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    doc.setTitle(pdfSafe(`${input.title} - Truvora`));
    doc.setProducer("Truvora");
    doc.setCreator("Truvora");

    let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const newPage = () => {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
    };
    const ensureSpace = (height: number) => {
        if (y - height < MARGIN + FOOTER_SPACE) newPage();
    };

    const text = (
        value: string,
        x: number,
        baseline: number,
        options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number } = {},
    ) => {
        const font = options.font ?? regular;
        const size = options.size ?? FONT_SIZE;
        const shown = options.maxWidth ? fit(value, font, size, options.maxWidth) : pdfSafe(value);
        page.drawText(shown, { x, y: baseline, size, font, color: options.color ?? INK });
        return shown;
    };

    // ---- Title block --------------------------------------------------------
    text("Truvora", MARGIN, y - 14, { size: 16, font: bold, color: GREEN });
    y -= 30;
    text(input.title, MARGIN, y - 12, { size: 13, font: bold, maxWidth: CONTENT_WIDTH });
    y -= 20;
    const ledgerKind = input.ledgerType === "business" ? "Business" : "Personal";
    text(`${input.ledgerName} (${ledgerKind} ledger)`, MARGIN, y - 9, { size: 9, color: MUTED, maxWidth: CONTENT_WIDTH });
    y -= 13;
    text(`Generated ${input.generatedLabel}`, MARGIN, y - 9, { size: 9, color: MUTED });
    y -= 13;
    for (const line of input.filterLines) {
        ensureSpace(13);
        text(line, MARGIN, y - 9, { size: 9, color: MUTED, maxWidth: CONTENT_WIDTH });
        y -= 13;
    }
    y -= 4;
    page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 1,
        color: GREEN,
    });
    y -= 14;

    // ---- Generic table with a repeating header ------------------------------
    const drawTable = (columns: PdfColumn[], rows: string[][], options: { zebra?: boolean } = {}) => {
        const totalWeight = columns.reduce((sum, column) => sum + column.width, 0);
        const widths = columns.map((column) => (column.width / totalWeight) * CONTENT_WIDTH);
        const cellPadding = 4;

        const header = () => {
            page.drawRectangle({
                x: MARGIN,
                y: y - ROW_HEIGHT + 3,
                width: CONTENT_WIDTH,
                height: ROW_HEIGHT,
                color: HEADER_FILL,
            });
            let x = MARGIN;
            columns.forEach((column, index) => {
                const width = widths[index] - cellPadding * 2;
                const shown = fit(column.header, bold, FONT_SIZE, width);
                const textX =
                    column.align === "right"
                        ? x + widths[index] - cellPadding - bold.widthOfTextAtSize(shown, FONT_SIZE)
                        : x + cellPadding;
                page.drawText(shown, { x: textX, y: y - 8, size: FONT_SIZE, font: bold, color: INK });
                x += widths[index];
            });
            y -= ROW_HEIGHT;
        };

        ensureSpace(ROW_HEIGHT * 2);
        header();

        rows.forEach((row, rowIndex) => {
            if (y - ROW_HEIGHT < MARGIN + FOOTER_SPACE) {
                newPage();
                header();
            }
            if (options.zebra !== false && rowIndex % 2 === 1) {
                page.drawRectangle({
                    x: MARGIN,
                    y: y - ROW_HEIGHT + 3,
                    width: CONTENT_WIDTH,
                    height: ROW_HEIGHT,
                    color: ZEBRA_FILL,
                });
            }
            let x = MARGIN;
            columns.forEach((column, index) => {
                const width = widths[index] - cellPadding * 2;
                const shown = fit(row[index] ?? "", regular, FONT_SIZE, width);
                const textX =
                    column.align === "right"
                        ? x + widths[index] - cellPadding - regular.widthOfTextAtSize(shown, FONT_SIZE)
                        : x + cellPadding;
                page.drawText(shown, { x: textX, y: y - 8, size: FONT_SIZE, font: regular, color: INK });
                x += widths[index];
            });
            y -= ROW_HEIGHT;
        });
        y -= 8;
    };

    const heading = (value: string) => {
        ensureSpace(ROW_HEIGHT * 3);
        text(value, MARGIN, y - 10, { size: 11, font: bold, color: GREEN });
        y -= 20;
    };

    // ---- Advanced summary ---------------------------------------------------
    const summary = input.level === "advanced" ? input.summary : undefined;
    if (summary && summary.totals.length > 0) {
        heading("Summary");
        drawTable(
            [
                { header: "Currency", width: 1.1 },
                { header: "Income", width: 2, align: "right" },
                { header: "Expenses", width: 2, align: "right" },
                { header: "Subscriptions", width: 2, align: "right" },
                { header: "Net", width: 2, align: "right" },
            ],
            summary.totals.map((t) => [
                t.currency,
                money(t.income, t.currency),
                money(t.expenses, t.currency),
                money(t.subscriptions, t.currency),
                money(t.net, t.currency),
            ]),
        );

        if (summary.categories.length > 0) {
            heading("Spending by category");
            drawTable(
                [
                    { header: "Category", width: 4 },
                    { header: "Currency", width: 1.2 },
                    { header: "Amount", width: 2.4, align: "right" },
                    { header: "Share", width: 1, align: "right" },
                ],
                summary.categories.map((c) => [
                    c.name,
                    c.currency,
                    money(c.amount, c.currency),
                    `${c.percent.toFixed(1)}%`,
                ]),
            );
        }

        if (input.ledgerType === "business" && summary.tax.length > 0) {
            heading("Tax summary");
            drawTable(
                [
                    { header: "Currency", width: 1 },
                    { header: "Deductible", width: 2, align: "right" },
                    { header: "Taxable income", width: 2.2, align: "right" },
                    { header: "Tax paid", width: 2, align: "right" },
                    { header: "Tax refunds", width: 2, align: "right" },
                    { header: "Net tax paid", width: 2, align: "right" },
                ],
                summary.tax.map((x) => [
                    x.currency,
                    money(x.deductible, x.currency),
                    money(x.taxableIncome, x.currency),
                    money(x.taxPaid, x.currency),
                    money(x.taxRefund, x.currency),
                    money(x.netTaxPaid, x.currency),
                ]),
            );
        }
        y -= 4;
    }

    // ---- Records ------------------------------------------------------------
    heading(input.rows.length === 1 ? "1 record" : `${input.rows.length} records`);
    if (input.rows.length === 0) {
        text("No records match.", MARGIN, y - 10, { color: MUTED });
        y -= 20;
    } else {
        drawTable(input.columns, input.rows);
    }
    if (input.truncatedNote) {
        ensureSpace(ROW_HEIGHT * 2);
        text(input.truncatedNote, MARGIN, y - 10, { size: 9, color: MUTED, maxWidth: CONTENT_WIDTH });
        y -= 16;
    }

    // ---- Footer on every page ----------------------------------------------
    const pages = doc.getPages();
    pages.forEach((p, index) => {
        p.drawLine({
            start: { x: MARGIN, y: MARGIN + 14 },
            end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 14 },
            thickness: 0.5,
            color: RULE,
        });
        p.drawText("Truvora", { x: MARGIN, y: MARGIN, size: 8, font: regular, color: MUTED });
        const label = `Page ${index + 1} of ${pages.length}`;
        p.drawText(label, {
            x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 8),
            y: MARGIN,
            size: 8,
            font: regular,
            color: MUTED,
        });
    });

    return doc.save();
}
