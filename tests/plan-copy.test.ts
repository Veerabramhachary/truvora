import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Plan copy must not sell what is not built. These features are not shipped yet;
// while that is true, any mention in the plan text must say "coming soon", and
// the matching feature flags must stay off. Remove an entry here in the same
// change that ships the feature.
const NOT_BUILT = [/xlsx/i, /saved views/i];

const FILES = ["scripts/plans.ts", "scripts/seed.ts"];

describe("plan copy only promises what exists", () => {
    for (const file of FILES) {
        const source = readFileSync(file, "utf8");

        it(`${file}: unbuilt features are labelled coming soon`, () => {
            const stringLiterals = source.match(/"[^"\n]{4,}"/g) ?? [];
            const offenders = stringLiterals.filter(
                (text) => NOT_BUILT.some((re) => re.test(text)) && !/coming soon/i.test(text),
            );
            expect(offenders).toEqual([]);
        });

        it(`${file}: XLSX and saved-view flags are off`, () => {
            expect(source).not.toMatch(/xlsx:\s*true/);
            expect(source).not.toMatch(/viewsAndFilters:\s*true/);
        });
    }
});
