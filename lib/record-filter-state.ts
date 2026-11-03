import type { CrudFilter } from "@refinedev/core";

/** Filter inputs as the UI holds them (everything a string; "" = not set). */
export type FilterState = {
    q: string;
    type: string;
    categoryId: string;
    currency: string;
    from: string; // yyyy-MM-dd from <input type="date">
    to: string;
    minAmount: string;
    maxAmount: string;
};

export const EMPTY_FILTERS: FilterState = {
    q: "",
    type: "",
    categoryId: "",
    currency: "",
    from: "",
    to: "",
    minAmount: "",
    maxAmount: "",
};

export function activeFilterCount(state: FilterState): number {
    return Object.values(state).filter((value) => value.trim() !== "").length;
}

function localDay(value: string, edge: "start" | "end"): string | undefined {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return undefined;
    const [, year, month, day] = match.map(Number) as unknown as number[];
    const date =
        edge === "start"
            ? new Date(year, month - 1, day, 0, 0, 0, 0)
            : new Date(year, month - 1, day, 23, 59, 59, 999);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Query-string filters for the list APIs. Dates are turned into the START and
 * END of the user's LOCAL day, sent as exact instants, so someone in India
 * filtering "1 Nov" gets records dated 1 Nov their time, not UTC.
 */
export function toRefineFilters(state: FilterState): CrudFilter[] {
    const filters: CrudFilter[] = [];
    const add = (field: string, value: string | undefined) => {
        if (value !== undefined && value.trim() !== "") {
            filters.push({ field, operator: "eq", value: value.trim() });
        }
    };
    add("q", state.q);
    add("type", state.type);
    add("categoryId", state.categoryId);
    add("currency", state.currency);
    add("from", localDay(state.from, "start"));
    add("to", localDay(state.to, "end"));
    add("minAmount", state.minAmount);
    add("maxAmount", state.maxAmount);
    return filters;
}
