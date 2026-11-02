import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// The helpers only build SQL here; keep the real pool out of the test.
vi.mock("@/db", () => ({ db: {} }));

import {
    activeSubscriptionAt,
    activeSubscriptionNow,
    countActiveSubscriptions,
    isSubscriptionActiveNow,
} from "@/lib/active-subscription";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const base = {
    active: true,
    startDate: day("2026-01-01"),
    endDate: day("9999-12-31"),
    deactivatedAt: null as Date | null,
};

describe("active subscription condition (JS mirror)", () => {
    it("is active when flagged, in range and not deactivated", () => {
        expect(isSubscriptionActiveNow(base, NOW)).toBe(true);
    });
    it("is not active when the flag is off", () => {
        expect(isSubscriptionActiveNow({ ...base, active: false }, NOW)).toBe(false);
    });
    it("is not active before its start date", () => {
        expect(isSubscriptionActiveNow({ ...base, startDate: day("2026-12-01") }, NOW)).toBe(false);
    });
    it("is not active after its end date", () => {
        expect(isSubscriptionActiveNow({ ...base, endDate: day("2026-10-31") }, NOW)).toBe(false);
    });
    it("is not active once deactivated", () => {
        expect(isSubscriptionActiveNow({ ...base, deactivatedAt: day("2026-10-01") }, NOW)).toBe(false);
    });
    it("is not active when its ledger is archived", () => {
        expect(isSubscriptionActiveNow({ ...base, ledgerArchivedAt: day("2026-10-01") }, NOW)).toBe(false);
        expect(isSubscriptionActiveNow({ ...base, ledgerArchivedAt: null }, NOW)).toBe(true);
    });
});

describe("active subscription condition (generated SQL)", () => {
    const dialect = new PgDialect();

    it("checks flag, start, end and deactivation, with `now` bound once", () => {
        const { sql, params } = dialect.sqlToQuery(activeSubscriptionNow(NOW));
        expect(sql).toContain('"active" = $1');
        expect(sql).toContain('"start_date" <=');
        expect(sql).toContain('"end_date" >=');
        expect(sql).toContain('"deactivated_at" is null');
        expect(params).toContain(true);
        expect(params.filter((p) => p instanceof Date || typeof p === "string")).toHaveLength(2);
    });

    it("excludes subscriptions whose ledger is archived", () => {
        const { sql } = dialect.sqlToQuery(activeSubscriptionNow(NOW));
        expect(sql).toMatch(/exists \(select 1 from "ledgers" where "ledgers"\."id" = "subscriptions"\."ledger_id" and "ledgers"\."archived_at" is null\)/i);
    });

    it("point-in-time variant ignores the flag but honours dates and deactivation", () => {
        const { sql } = dialect.sqlToQuery(activeSubscriptionAt(NOW));
        expect(sql).not.toContain('"active"');
        expect(sql).toContain('"start_date" <=');
        expect(sql).toContain('"end_date" >=');
        expect(sql).toContain('"deactivated_at" is null');
        expect(sql).toContain('"deactivated_at" >');
    });
});

// Guard: nobody re-introduces a private copy of the "active" rule.
describe("no inline copies of the active rule", () => {
    const roots = ["app", "lib"];
    const allowed = new Set([join("lib", "active-subscription.ts")]);
    // The list screen's sweep legitimately *writes* the flag; it is allowed
    // to mention `subscriptions.active = TRUE` in its UPDATE.
    const sweepAllowed = new Set([join("app", "api", "subscriptions", "route.ts")]);

    function walk(dir: string, out: string[] = []): string[] {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) walk(full, out);
            else if (/\.(ts|tsx)$/.test(name)) out.push(full);
        }
        return out;
    }

    const files = roots.flatMap((r) => walk(r));

    it("never filters subscriptions on the raw flag alone", () => {
        const offenders = files.filter((f) => {
            if (allowed.has(f) || sweepAllowed.has(f)) return false;
            return /eq\(subscriptions\.active,\s*true\)/.test(readFileSync(f, "utf8"));
        });
        expect(offenders).toEqual([]);
    });

    it("never writes the 'deleted' action", () => {
        const offenders = files.filter((f) =>
            /action\s*(!=|=)\s*'deleted'|action:\s*"deleted"/.test(readFileSync(f, "utf8")),
        );
        expect(offenders).toEqual([]);
    });
});

describe("plan limit count", () => {
    const dialect = new PgDialect();

    it("counts the owner's active subscriptions and leaves out archived ledgers", async () => {
        let captured: unknown;
        const executor = {
            select: () => ({
                from: () => ({
                    where: (condition: unknown) => {
                        captured = condition;
                        return Promise.resolve([{ count: 2 }]);
                    },
                }),
            }),
            insert: () => {
                throw new Error("not used");
            },
        };
        const count = await countActiveSubscriptions(executor as never, "user_1", NOW);
        expect(count).toBe(2);

        const { sql, params } = dialect.sqlToQuery(captured as never);
        expect(sql).toContain('"user_id" = $');
        expect(params).toContain("user_1");
        expect(sql).toMatch(/exists \(select 1 from "ledgers"/i);
        expect(sql).toContain('"archived_at" is null');
    });
});
