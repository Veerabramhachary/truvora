import type { CrudFilter } from "@refinedev/core";
import { ledgerFetch } from "@/lib/ledger-client";

export type ExportSource = "transactions" | "expenses" | "subscriptions";
export type ExportFormat = "csv" | "pdf";

/**
 * Downloads an export from `/api/export` for the active ledger.
 *
 * The list filters are sent along, so an export contains what the user is
 * looking at; with no filters it is the whole ledger, as before. The browser's
 * time-zone offset is sent too, so dates in the file match the dates on screen.
 *
 * Throws an Error whose message is safe to show (the server's own reason, such
 * as a plan limit, when it gave one).
 */
export async function downloadExport(options: {
    source: ExportSource;
    format: ExportFormat;
    filters?: CrudFilter[];
}): Promise<void> {
    const { source, format, filters = [] } = options;

    const params = new URLSearchParams({
        type: source,
        format,
        tzOffset: String(new Date().getTimezoneOffset()),
    });
    for (const filter of filters) {
        if ("field" in filter && filter.value !== undefined && filter.value !== null) {
            const value = String(filter.value);
            // `type` already names the export source, so the record-type filter
            // travels as `recordType`.
            const name = filter.field === "type" ? "recordType" : filter.field;
            if (value !== "") params.set(name, value);
        }
    }

    const response = await ledgerFetch(`/api/export?${params.toString()}`);
    if (!response.ok) {
        let message = `Could not export ${source} as ${format.toUpperCase()}.`;
        try {
            const body = (await response.json()) as { error?: unknown };
            if (typeof body.error === "string" && body.error.trim()) message = body.error;
        } catch {
            /* keep the generic message */
        }
        throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${source}.${format}`;

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}
