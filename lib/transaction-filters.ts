import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";

/**
 * Search/filter for the Transactions and Expenses lists (F-05).
 *
 * Everything except free-text search is done in SQL. Titles, notes and
 * descriptions are encrypted at rest, so the database cannot search them:
 * text search decrypts rows in the app and matches there, over at most
 * MAX_SEARCH_SCAN rows that already passed the SQL filters.
 */
export const MAX_SEARCH_SCAN = 5000;

export type RecordType = "income" | "expense" | "subscription";

export type RecordFilters = {
    q?: string;
    types?: RecordType[];
    categoryIds?: string[];
    currency?: string;
    from?: Date;
    to?: Date;
    minAmount?: string;
    maxAmount?: string;
};

const ALL_TYPES: readonly RecordType[] = ["income", "expense", "subscription"];
const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = z.string().uuid();

/** `2026-11-01` means the whole UTC day; a full ISO timestamp is used as given. */
function parseDate(raw: string, edge: "start" | "end"): Date | null {
    const value = raw.trim();
    const bare = BARE_DATE.test(value);
    const date = bare
        ? new Date(`${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`)
        : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    // JavaScript rolls impossible dates over (2026-02-31 becomes 3 March);
    // reject them instead of quietly filtering the wrong day.
    if (bare && date.toISOString().slice(0, 10) !== value) return null;
    return date;
}

type ParseResult =
    | { ok: true; filters: RecordFilters }
    | { ok: false; error: string };

export function parseRecordFilters(
    params: URLSearchParams,
    allowedTypes: readonly RecordType[] = ALL_TYPES,
): ParseResult {
    const get = (key: string) => {
        const value = params.get(key)?.trim();
        return value ? value : undefined;
    };
    const filters: RecordFilters = {};

    const q = get("q");
    if (q !== undefined) {
        if (q.length > 100) return { ok: false, error: "Search text is too long" };
        filters.q = q;
    }

    const type = get("type");
    if (type !== undefined) {
        const types = [...new Set(type.split(",").map((t) => t.trim()).filter(Boolean))];
        if (types.length === 0 || types.some((t) => !allowedTypes.includes(t as RecordType))) {
            return { ok: false, error: "Invalid type filter" };
        }
        filters.types = types as RecordType[];
    }

    const categoryId = get("categoryId");
    if (categoryId !== undefined) {
        const ids = [...new Set(categoryId.split(",").map((c) => c.trim()).filter(Boolean))];
        if (ids.length === 0 || ids.length > 20 || ids.some((id) => !uuid.safeParse(id).success)) {
            return { ok: false, error: "Invalid category filter" };
        }
        filters.categoryIds = ids;
    }

    const currency = get("currency")?.toUpperCase();
    if (currency !== undefined) {
        if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Invalid currency filter" };
        filters.currency = currency;
    }

    const from = get("from");
    if (from !== undefined) {
        const date = parseDate(from, "start");
        if (!date) return { ok: false, error: "Invalid from date" };
        filters.from = date;
    }
    const to = get("to");
    if (to !== undefined) {
        const date = parseDate(to, "end");
        if (!date) return { ok: false, error: "Invalid to date" };
        filters.to = date;
    }
    if (filters.from && filters.to && filters.from > filters.to) {
        return { ok: false, error: "The from date is after the to date" };
    }

    const minAmount = get("minAmount");
    if (minAmount !== undefined) {
        if (!AMOUNT.test(minAmount)) return { ok: false, error: "Invalid minimum amount" };
        filters.minAmount = minAmount;
    }
    const maxAmount = get("maxAmount");
    if (maxAmount !== undefined) {
        if (!AMOUNT.test(maxAmount)) return { ok: false, error: "Invalid maximum amount" };
        filters.maxAmount = maxAmount;
    }
    if (
        filters.minAmount !== undefined &&
        filters.maxAmount !== undefined &&
        Number(filters.minAmount) > Number(filters.maxAmount)
    ) {
        return { ok: false, error: "The minimum amount is above the maximum" };
    }

    return { ok: true, filters };
}

type FilterColumns = {
    type: PgColumn;
    categoryId: PgColumn;
    currency: PgColumn;
    date: PgColumn;
    amount: PgColumn;
};

/** SQL conditions for every filter except free-text `q` (see matchesText). */
export function buildFilterConditions(columns: FilterColumns, filters: RecordFilters): SQL[] {
    const conditions: SQL[] = [];
    if (filters.types) conditions.push(inArray(columns.type, filters.types));
    if (filters.categoryIds) conditions.push(inArray(columns.categoryId, filters.categoryIds));
    if (filters.currency) conditions.push(eq(columns.currency, filters.currency));
    if (filters.from) conditions.push(gte(columns.date, filters.from));
    if (filters.to) conditions.push(lte(columns.date, filters.to));
    if (filters.minAmount !== undefined) conditions.push(gte(columns.amount, filters.minAmount));
    if (filters.maxAmount !== undefined) conditions.push(lte(columns.amount, filters.maxAmount));
    return conditions;
}

/** Case-insensitive "contains" over already-decrypted text fields. */
export function matchesText(values: (string | null | undefined)[], q: string): boolean {
    const needle = q.trim().toLocaleLowerCase();
    if (!needle) return true;
    return values.some((value) => (value ?? "").toLocaleLowerCase().includes(needle));
}

export function andAll(conditions: (SQL | undefined)[]): SQL {
    return and(...conditions.filter((c): c is SQL => c !== undefined))!;
}
