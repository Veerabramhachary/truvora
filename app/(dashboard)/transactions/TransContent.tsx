"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/header";
import { RecordFilters } from "@/components/record-filters";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useTable } from "@refinedev/core";
import { toast } from "sonner";
import { FeatureGate } from "@/lib/feature-gate";
import { downloadExport } from "@/lib/export-client";
import { formatCurrency } from "@/lib/currencies";
import { displayCategoryName } from "@/lib/categories";
import { useLedger } from "@/components/ledger-provider";
import { TAX_KIND_LABELS, type TaxKind } from "@/lib/tax";
import {
    activeFilterCount,
    EMPTY_FILTERS,
    toRefineFilters,
    type FilterState,
} from "@/lib/record-filter-state";

/** Shape returned by GET /api/transactions. */
interface TransactionRow {
    id: string;
    title: string;
    type: "income" | "expense" | "subscription";
    amount: string | number;
    currency?: string | null;
    category?: { id: string; name: string | null } | null;
    date: string;
    createdAt: string;
    taxKind?: TaxKind | null;
}

const TYPES = [
    { value: "expense", label: "Expense" },
    { value: "income", label: "Income" },
    { value: "subscription", label: "Subscription" },
];

const TransContent = () => {
    const { active } = useLedger();
    const showTax = active?.type === "business";
    const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
    const refineFilters = useMemo(() => toRefineFilters(filters), [filters]);
    const filterKey = JSON.stringify(refineFilters);
    const filtersActive = activeFilterCount(filters) > 0;

    const {
        tableQuery,
        currentPage,
        setCurrentPage,
        pageSize,
        sorters,
        setSorters,
    } = useTable({
        resource: "transactions",
        pagination: {
            // `mode: "server"` is the default, but make it explicit: the route
            // honours `_start`/`_end` and reports `X-Total-Count`.
            mode: "server",
            currentPage: 1,
            pageSize: 10,
        },
        sorters: {
            initial: [{ field: "date", order: "desc" }],
        },
        // Search and filters are always applied on top of the paging/sorting.
        filters: { permanent: refineFilters },
    });

    // A new search or filter always starts again from the first page. Only
    // react to the filters actually changing, so paging is never reset by
    // an unrelated re-render.
    const lastFilterKey = useRef(filterKey);
    useEffect(() => {
        if (lastFilterKey.current === filterKey) return;
        lastFilterKey.current = filterKey;
        setCurrentPage(1);
    }, [filterKey, setCurrentPage]);

    const headers = ["Title", "Category", "Type", "Amount", "Date", "Created", ...(showTax ? ["Tax"] : [])];

    const { data, isLoading, isError } = tableQuery;

    const transactions = (data?.data ?? []) as TransactionRow[];
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    // Keep the filter bar mounted while results load, or typing would lose focus.
    const firstLoad = isLoading && transactions.length === 0;

    const handleExport = async (format: "csv" | "pdf") => {
        try {
            // What you see is what you get: the current search and filters are
            // sent along. With none set it is the whole ledger, not one page.
            await downloadExport({ source: "transactions", format, filters: refineFilters });
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Could not export transactions.",
            );
        }
    };

    const toggleSort = () => {
        const currentOrder = sorters?.find((s) => s.field === "date")?.order;

        setSorters([
            {
                field: "date",
                order: currentOrder === "desc" ? "asc" : "desc",
            },
        ]);
    };

    return (
        <section className="p-6 space-y-6">
            <title>Transactions</title>

            {/* HEADER */}
            <Header src="/money.png" alt="money" title="Transactions">
                <Button variant="secondary" onClick={toggleSort}>
                    Sort Date
                </Button>

                <Button variant="outline" onClick={() => handleExport("csv")}>
                    Export CSV
                </Button>

                <FeatureGate feature="exportFormats">
                    <Button variant="outline" onClick={() => handleExport("pdf")}>
                        Export PDF
                    </Button>
                </FeatureGate>
            </Header>

            <RecordFilters value={filters} onChange={setFilters} types={TYPES} />

            {isError && (
                <div role="alert" className="p-4 text-red-500">
                    Error loading transactions
                </div>
            )}

            {/* TABLE */}
            <Table>
                <TableHeader>
                    <TableRow>
                        {headers.map((header) => (
                            <TableHead key={header}>{header}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {firstLoad && (
                        <TableRow>
                            <TableCell colSpan={headers.length} className="text-center py-6 text-muted-foreground">
                                Loading...
                            </TableCell>
                        </TableRow>
                    )}

                    {!firstLoad && !isError && transactions.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={headers.length} className="text-center py-6">
                                {filtersActive
                                    ? "No transactions match your search or filters"
                                    : "No transactions found"}
                                {filtersActive && (
                                    <Button variant="link" onClick={() => setFilters(EMPTY_FILTERS)}>
                                        Clear filters
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                    )}

                    {transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                            <TableCell>{transaction.title}</TableCell>
                            <TableCell>
                                {transaction.category?.name
                                    ? displayCategoryName(transaction.category.name)
                                    : "—"}
                            </TableCell>
                            <TableCell className="capitalize">
                                {transaction.type}
                            </TableCell>
                            <TableCell>
                                {formatCurrency(
                                    Number(transaction.amount),
                                    transaction.currency ?? undefined,
                                )}
                            </TableCell>
                            <TableCell>
                                {new Date(transaction.date).toDateString()}
                            </TableCell>
                            <TableCell>
                                {new Date(transaction.createdAt).toDateString()}
                            </TableCell>
                            {showTax && (
                                <TableCell>
                                    {transaction.taxKind ? TAX_KIND_LABELS[transaction.taxKind] : "—"}
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* PAGINATION */}
            <div className="flex justify-between items-center pt-4">
                <p className="text-sm text-gray-500">
                    {total} {total === 1 ? "record" : "records"} · Page {currentPage} of {totalPages}
                </p>

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(currentPage - 1)}
                    >
                        Previous
                    </Button>

                    <Button
                        variant="outline"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(currentPage + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </section>
    );
};

export default TransContent;
