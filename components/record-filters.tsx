"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { displayCategoryName } from "@/lib/categories";
import { ledgerFetch } from "@/lib/ledger-client";
import {
    activeFilterCount,
    EMPTY_FILTERS,
    type FilterState,
} from "@/lib/record-filter-state";

type Options = {
    categories: { id: string; name: string }[];
    currencies: string[];
};

const ALL = "all";

type Props = {
    value: FilterState;
    onChange: (next: FilterState) => void;
    /** Which record types this list can contain. */
    types: { value: string; label: string }[];
};

/**
 * Search + filter bar shared by the Transactions and Expenses lists. It keeps
 * its own text-box draft so typing stays instant; the search only reaches the
 * list after a short pause. Category and currency choices come from the
 * ledger's own records.
 */
export function RecordFilters({ value, onChange, types }: Props) {
    const [options, setOptions] = useState<Options>({ categories: [], currencies: [] });
    const [draft, setDraft] = useState(value.q);
    const previousQuery = useRef(value.q);

    useEffect(() => {
        let cancelled = false;
        ledgerFetch("/api/transactions/filter-options")
            .then((response) => (response.ok ? response.json() : null))
            .then((body: Options | null) => {
                if (!cancelled && body) setOptions(body);
            })
            .catch(() => {
                /* dropdowns simply stay empty; search and dates still work */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (previousQuery.current === value.q) return;
        previousQuery.current = value.q;
        // External query changes (for example clearing filters) reset the draft.
        setDraft(value.q);
    }, [value.q]);

    // Debounce the search box.
    useEffect(() => {
        if (draft === value.q) return;
        const timer = setTimeout(() => onChange({ ...value, q: draft }), 300);
        return () => clearTimeout(timer);
    }, [draft, value, onChange]);

    const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
    const active = activeFilterCount(value) + (draft !== value.q && draft.trim() ? 1 : 0);

    return (
        <div className="space-y-3 rounded-lg border bg-card p-3" role="search" aria-label="Search and filter">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="filter-q">Search</Label>
                    <Input
                        id="filter-q"
                        type="search"
                        value={draft}
                        maxLength={100}
                        placeholder="Search title or notes"
                        onChange={(event) => setDraft(event.target.value)}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="filter-type">Type</Label>
                    <Select
                        value={value.type || ALL}
                        onValueChange={(next) => set({ type: next === ALL ? "" : next })}
                    >
                        <SelectTrigger id="filter-type" className="w-full">
                            <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All types</SelectItem>
                            {types.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="filter-category">Category</Label>
                    <Select
                        value={value.categoryId || ALL}
                        onValueChange={(next) => set({ categoryId: next === ALL ? "" : next })}
                    >
                        <SelectTrigger id="filter-category" className="w-full">
                            <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All categories</SelectItem>
                            {options.categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                    {displayCategoryName(category.name)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="filter-from">From</Label>
                    <Input
                        id="filter-from"
                        type="date"
                        value={value.from}
                        max={value.to || undefined}
                        onChange={(event) => set({ from: event.target.value })}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="filter-to">To</Label>
                    <Input
                        id="filter-to"
                        type="date"
                        value={value.to}
                        min={value.from || undefined}
                        onChange={(event) => set({ to: event.target.value })}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="filter-min">Min amount</Label>
                    <Input
                        id="filter-min"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={value.minAmount}
                        onChange={(event) => set({ minAmount: event.target.value })}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="filter-max">Max amount</Label>
                    <Input
                        id="filter-max"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={value.maxAmount}
                        onChange={(event) => set({ maxAmount: event.target.value })}
                    />
                </div>

                {options.currencies.length > 1 && (
                    <div className="space-y-1.5">
                        <Label htmlFor="filter-currency">Currency</Label>
                        <Select
                            value={value.currency || ALL}
                            onValueChange={(next) => set({ currency: next === ALL ? "" : next })}
                        >
                            <SelectTrigger id="filter-currency" className="w-full">
                                <SelectValue placeholder="All currencies" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>All currencies</SelectItem>
                                {options.currencies.map((currency) => (
                                    <SelectItem key={currency} value={currency}>
                                        {currency}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    Text search looks through up to 5,000 matching records. Narrow the dates to search older ones.
                </p>
                {active > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setDraft("");
                            onChange(EMPTY_FILTERS);
                        }}
                    >
                        <X className="mr-1 size-4" aria-hidden />
                        Clear filters
                    </Button>
                )}
            </div>
        </div>
    );
}
