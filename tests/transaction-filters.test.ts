import { describe, expect, it } from "vitest";
import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { transactions } from "@/db/schema/schema";
import {
    buildFilterConditions,
    matchesText,
    parseRecordFilters,
} from "@/lib/transaction-filters";
import {
    activeFilterCount,
    EMPTY_FILTERS,
    toRefineFilters,
} from "@/lib/record-filter-state";

const CAT = "3f2b1c9e-8a4d-4c1e-9b7a-2d5e6f708192";
const qs = (query: string) => new URLSearchParams(query);

describe("parseRecordFilters", () => {
    it("accepts every filter and normalises it", () => {
        const result = parseRecordFilters(
            qs(`q=%20rent%20&type=expense,income,expense&categoryId=${CAT}&currency=inr&from=2026-11-01&to=2026-11-30&minAmount=10&maxAmount=99.5`),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.filters.q).toBe("rent");
        expect(result.filters.types).toEqual(["expense", "income"]);
        expect(result.filters.categoryIds).toEqual([CAT]);
        expect(result.filters.currency).toBe("INR");
        expect(result.filters.from?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
        // A bare end date means the whole day.
        expect(result.filters.to?.toISOString()).toBe("2026-11-30T23:59:59.999Z");
        expect(result.filters.minAmount).toBe("10");
        expect(result.filters.maxAmount).toBe("99.5");
    });

    it("treats empty values as not set", () => {
        const result = parseRecordFilters(qs("q=&type=&categoryId=&currency=&from=&to=&minAmount=&maxAmount="));
        expect(result).toEqual({ ok: true, filters: {} });
    });

    it("uses full timestamps exactly as given", () => {
        const result = parseRecordFilters(qs("from=2026-10-31T18:30:00.000Z&to=2026-11-30T18:29:59.999Z"));
        expect(result.ok && result.filters.from?.toISOString()).toBe("2026-10-31T18:30:00.000Z");
        expect(result.ok && result.filters.to?.toISOString()).toBe("2026-11-30T18:29:59.999Z");
    });

    it.each([
        ["type=bogus"],
        ["type=subscription"], // not allowed on this list (see next test)
        [`categoryId=not-a-uuid`],
        ["currency=rupees"],
        ["from=yesterday"],
        ["to=2026-02-31"],
        ["from=2026-12-01&to=2026-11-01"],
        ["minAmount=abc"],
        ["maxAmount=1.234"],
        ["minAmount=50&maxAmount=5"],
        [`q=${"x".repeat(101)}`],
    ])("rejects %s", (query) => {
        const result = parseRecordFilters(qs(query), ["income", "expense"]);
        expect(result.ok).toBe(false);
    });

    it("allows the subscription type only where the list can contain it", () => {
        expect(parseRecordFilters(qs("type=subscription")).ok).toBe(true);
        expect(parseRecordFilters(qs("type=subscription"), ["income", "expense"]).ok).toBe(false);
    });
});

describe("buildFilterConditions", () => {
    const dialect = new PgDialect();
    const render = (query: string) => {
        const parsed = parseRecordFilters(qs(query));
        if (!parsed.ok) throw new Error(parsed.error);
        const { q: _q, ...sqlFilters } = parsed.filters;
        void _q;
        return dialect.sqlToQuery(and(...buildFilterConditions(transactions, sqlFilters))!);
    };

    it("adds nothing for an empty filter", () => {
        expect(buildFilterConditions(transactions, {})).toEqual([]);
    });

    it("binds every value as a parameter (no string building)", () => {
        const { sql, params } = render(
            `type=expense&categoryId=${CAT}&currency=INR&from=2026-11-01&to=2026-11-30&minAmount=10&maxAmount=99`,
        );
        expect(sql).toContain('"type" in');
        expect(sql).toContain('"category_id" in');
        expect(sql).toContain('"currency" =');
        expect(sql).toContain('"date" >=');
        expect(sql).toContain('"date" <=');
        expect(sql).toContain('"amount" >=');
        expect(sql).toContain('"amount" <=');
        expect(params).toEqual(expect.arrayContaining(["expense", CAT, "INR", "10", "99"]));
        expect(sql).not.toContain(CAT);
    });
});

describe("matchesText", () => {
    it("matches case-insensitively in any field", () => {
        expect(matchesText(["Netflix Premium", null], "netflix")).toBe(true);
        expect(matchesText(["Rent", "March flat deposit"], "FLAT")).toBe(true);
    });
    it("does not match unrelated text or empty fields", () => {
        expect(matchesText(["Rent", null], "netflix")).toBe(false);
        expect(matchesText([null, undefined], "x")).toBe(false);
    });
    it("an empty search matches everything", () => {
        expect(matchesText(["anything"], "  ")).toBe(true);
    });
});

describe("UI filter state", () => {
    it("sends nothing for empty filters", () => {
        expect(toRefineFilters(EMPTY_FILTERS)).toEqual([]);
        expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    });

    it("turns dates into the start and end of the user's LOCAL day", () => {
        const filters = toRefineFilters({ ...EMPTY_FILTERS, from: "2026-11-01", to: "2026-11-30" });
        expect(filters).toEqual([
            { field: "from", operator: "eq", value: new Date(2026, 10, 1, 0, 0, 0, 0).toISOString() },
            { field: "to", operator: "eq", value: new Date(2026, 10, 30, 23, 59, 59, 999).toISOString() },
        ]);
    });

    it("passes the other fields through trimmed, skipping blanks", () => {
        const filters = toRefineFilters({ ...EMPTY_FILTERS, q: " rent ", type: "expense", minAmount: "  " });
        expect(filters).toEqual([
            { field: "q", operator: "eq", value: "rent" },
            { field: "type", operator: "eq", value: "expense" },
        ]);
        expect(activeFilterCount({ ...EMPTY_FILTERS, q: "a", type: "income" })).toBe(2);
    });
});
