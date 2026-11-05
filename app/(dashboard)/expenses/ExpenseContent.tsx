"use client";

import Header from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FeatureGate } from "@/lib/feature-gate";
import { useDelete, useList } from "@refinedev/core";
import { downloadExport } from "@/lib/export-client";
import { useRefreshAll } from "@/lib/use-refresh";
import { format, isValid } from "date-fns";
import FormExpense from "./FormExpense";
import type { ExpenseRecord } from "./TransactionForm";
import { useEffect, useMemo, useState } from "react";
import { RecordFilters } from "@/components/record-filters";
import {
    activeFilterCount,
    EMPTY_FILTERS,
    toRefineFilters,
    type FilterState,
} from "@/lib/record-filter-state";
import { ConfirmDeleteDialog } from "@/components/confirm-delete";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currencies";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 12;

const ExpenseContent = () => {
    const [open, setOpen] = useState(false);
    const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
    const [editing, setEditing] = useState<ExpenseRecord | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ExpenseRecord | null>(
        null,
    );
    const { mutateAsync: deleteAsync } = useDelete();
    const refreshAll = useRefreshAll();

    const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const refineFilters = useMemo(() => toRefineFilters(filters), [filters]);
    const filtersActive = activeFilterCount(filters) > 0;

    const handleFiltersChange = (next: FilterState) => {
        setFilters(next);
        setPage(1);
    };

    // Previously this asked for the default 10 records and had no way to see
    // more; now it pages through everything the filters match.
    const { query, result } = useList({
        resource: "expenses",
        pagination: { currentPage: page, pageSize: PAGE_SIZE },
        filters: refineFilters,
    });

    const closeForm = () => {
        setOpen(false);
        setEditing(null);
    };

    const handleExport = async (exportFormat: "csv" | "pdf") => {
        setExporting(exportFormat);
        try {
            // What you see is what you get: the current search and filters are
            // sent along. With none set it is the whole ledger.
            await downloadExport({
                source: "expenses",
                format: exportFormat,
                filters: refineFilters,
            });
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Could not export expenses.",
            );
        } finally {
            setExporting(null);
        }
    };

    const { isLoading, isError } = query;
    // The data provider returns BaseRecord; assert the shape the API actually
    // sends so the cards below are typed instead of implicitly `any`.
    const data = (result?.data ?? []) as ExpenseRecord[];

    const total = result?.total ?? data.length;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    useEffect(() => {
        if (!isLoading && result && page > pageCount) {
            // The loaded total can shrink after the final item on this page is removed.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPage(pageCount);
        }
    }, [isLoading, result, page, pageCount]);
    // Keep the search box mounted while results load, or typing would lose focus.
    const firstLoad = isLoading && data.length === 0;

    return (
        <section className="w-full space-y-6 relative">
            <Header src="/money.png" alt="Expenses Icon" title="Expenses">
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setEditing(null);
                            setOpen(true);
                        }}
                    >
                        Create
                    </Button>
                    <FeatureGate feature="exports" quantity={1}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport("csv")}
                            disabled={exporting !== null}
                        >
                            {exporting === "csv" ? "Exporting..." : "Export CSV"}
                        </Button>
                    </FeatureGate>
                    <FeatureGate feature="exportFormats">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport("pdf")}
                            disabled={exporting !== null}
                        >
                            {exporting === "pdf" ? "Exporting..." : "Export PDF"}
                        </Button>
                    </FeatureGate>
                </div>
            </Header>
            <Dialog
                open={open}
                onOpenChange={(nextOpen) => !nextOpen && closeForm()}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? "Edit transaction" : "Add transaction"}
                        </DialogTitle>
                        <DialogDescription>
                            {editing
                                ? "Update the details for this record."
                                : "Add an expense or income to your ledger."}
                        </DialogDescription>
                    </DialogHeader>
                    <FormExpense
                        editing={editing}
                        onClose={closeForm}
                        onSaved={closeForm}
                    />
                </DialogContent>
            </Dialog>

            <RecordFilters
                value={filters}
                onChange={handleFiltersChange}
                types={[
                    { value: "expense", label: "Expense" },
                    { value: "income", label: "Income" },
                ]}
            />

            {isError ? (
                <div
                    role="alert"
                    className="p-10 text-destructive text-center font-medium"
                >
                    Failed to load expenses. Please refresh the page.
                </div>
            ) : firstLoad ? (
                <div className="flex h-64 w-full items-center justify-center p-10">
                    <p className="animate-pulse text-muted-foreground">
                        Loading expenses...
                    </p>
                </div>
            ) : data.length === 0 ? (
                <div className="text-center p-20 border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground">
                        {filtersActive
                            ? "No expenses match your search or filters."
                            : "No expenses found."}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {data.map((item) => (
                        <Card key={item.id} className="flex flex-col min-w-0">
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                <CardTitle className="text-base font-semibold truncate max-w-[150px]">
                                    {item.title}
                                </CardTitle>
                                <Badge
                                    variant={
                                        item.type === "expense"
                                            ? "destructive"
                                            : "secondary"
                                    }
                                    className="capitalize"
                                >
                                    {item.type}
                                </Badge>
                            </CardHeader>

                            <CardContent className="flex-1 space-y-3">
                                {/* Fixed: Removed h1 for price to fix SEO/Accessibility */}
                                <div>
                                    <p className="text-2xl font-bold tracking-tight">
                                        {formatCurrency(
                                            Number(item.amount ?? 0),
                                            item.currency || "INR",
                                        )}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                        {item.categoryName}
                                    </p>
                                </div>

                                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                                    {item.description ||
                                        "No description provided."}
                                </p>

                                <Separator />

                                <p className="text-xs font-medium text-muted-foreground">
                                    Date:{" "}
                                    {isValid(new Date(item.date))
                                        ? format(
                                              new Date(item.date),
                                              "MMM d, yyyy",
                                          )
                                        : "Invalid date"}
                                </p>
                            </CardContent>

                            <CardFooter className="grid grid-cols-2 gap-2 border-t p-3 bg-muted/30">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                    aria-label={`Edit ${item.title}`}
                                    onClick={() => {
                                        setEditing(item);
                                        setOpen(true);
                                    }}
                                >
                                    Edit
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-destructive hover:bg-destructive/10"
                                    aria-label={`Delete ${item.title}`}
                                    onClick={() => setPendingDelete(item)}
                                >
                                    Delete
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}

            {total > PAGE_SIZE && (
                <nav
                    className="flex items-center justify-between"
                    aria-label="Expenses pages"
                >
                    <p className="text-sm text-muted-foreground">
                        {total} records · Page {page} of {pageCount}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() =>
                                setPage((current) => Math.max(1, current - 1))
                            }
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= pageCount}
                            onClick={() =>
                                setPage((current) =>
                                    Math.min(pageCount, current + 1),
                                )
                            }
                        >
                            Next
                        </Button>
                    </div>
                </nav>
            )}

            <ConfirmDeleteDialog
                open={pendingDelete !== null}
                name={pendingDelete?.title ?? "this expense"}
                description="It disappears from your expenses and the matching ledger entry is removed. This can't be undone."
                onConfirm={async () => {
                    if (!pendingDelete) return;
                    await deleteAsync({
                        resource: "expenses",
                        id: pendingDelete.id,
                    });
                }}
                onCancel={() => setPendingDelete(null)}
                onSuccess={() => {
                    setPendingDelete(null);
                    closeForm();
                    query.refetch();
                    // Deleting an expense also changes the dashboard totals.
                    refreshAll();
                }}
            />
        </section>
    );
};

export default ExpenseContent;
