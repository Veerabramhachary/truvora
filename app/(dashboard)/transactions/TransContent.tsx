"use client";

import Header from "@/components/header";
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
import { formatCurrency } from "@/lib/currencies";

/** Shape returned by GET /api/transactions. */
interface TransactionRow {
    id: string;
    title: string;
    type: "income" | "expense" | "subscription";
    amount: string | number;
    currency?: string | null;
    date: string;
    createdAt: string;
}

const TransContent = () => {
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
    });

    const headers = ["Id", "Title", "Type", "Amount", "Date", "Created"];

    const { data, isLoading, isError } = tableQuery;

    const transactions = (data?.data ?? []) as TransactionRow[];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    const handleExport = async () => {
        try {
            // The whole ledger, not just this page — the server does the CSV.
            const response = await fetch("/api/export?type=transactions");
            if (!response.ok) {
                throw response;
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "transactions.csv";
            link.click();
            URL.revokeObjectURL(url);
            link.remove();
        } catch (error) {
            toast.error(
                error instanceof Response
                    ? "Export isn't available yet."
                    : "Could not export transactions.",
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

    if (isLoading) return <div className="p-4">Loading...</div>;
    if (isError)
        return (
            <div className="p-4 text-red-500">Error loading transactions</div>
        );

    return (
        <section className="p-6 space-y-6">
            <title>Transactions</title>

            {/* HEADER */}
            <Header src="/money.png" alt="money" title="Transactions">
                <Button variant="secondary" onClick={toggleSort}>
                    Sort Date
                </Button>

                <Button variant="outline" onClick={handleExport}>
                    Export CSV
                </Button>
            </Header>

            {/* TABLE */}
            <Table>
                <TableHeader>
                    <TableRow>
                        {headers.map((header, index) => (
                            <TableHead key={index}>{header}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {transactions.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-6">
                                No transactions found
                            </TableCell>
                        </TableRow>
                    )}

                    {transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                            <TableCell>{transaction.id}</TableCell>
                            <TableCell>{transaction.title}</TableCell>
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
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* PAGINATION */}
            <div className="flex justify-between items-center pt-4">
                <p className="text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
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
