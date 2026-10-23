import { useInvalidate } from "@refinedev/core";

/**
 * Refresh every cached query after a mutation.
 *
 * The dashboard reads through `useCustom` (`/api/dashboard/stats` and
 * `/api/dashboard/charts`), and Refine only auto-invalidates the `list` and
 * `detail` queries for the mutated *resource*. So adding an expense refreshed
 * the expenses list but left the dashboard showing the old totals until a hard
 * reload.
 *
 * `invalidates: ["all"]` is deliberately broad. Each screen holds only a
 * handful of queries, and reaching for the custom query keys by hand is what
 * got out of sync in the first place.
 */
export function useRefreshAll() {
    const invalidate = useInvalidate();
    return () => invalidate({ invalidates: ["all"] });
}
