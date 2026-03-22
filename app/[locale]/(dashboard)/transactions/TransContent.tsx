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

const TransContent = () => {
    const {
        tableQuery,
        currentPage,
        setCurrentPage,
        pageSize,
        setPageSize,
        sorters,
        setSorters,
    } = useTable({
        resource: "transactions",
        pagination: {
            currentPage: 1,
            pageSize: 10,
        },
        sorters: {
            initial: [{ field: "date", order: "desc" }],
        },
    });

    const headers = ["Id", "Title", "Type", "Amount", "Date", "Created"];

    const { data, isLoading, isError } = tableQuery;

    const transactions = data?.data ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    const handleExport = () => {
        const escapeCSVField = (field: string): string => {
            if (
                field.includes(",") ||
                field.includes('"') ||
                field.includes("\n")
            ) {
                return '"' + field.replace(/"/g, '""') + '"';
            }
            return field;
        };

        const csv = [
            headers.map(escapeCSVField).join(","),
            ...transactions.map((t: any) =>
                [
                    t.id,
                    t.title,
                    t.type,
                    t.amount,
                    new Date(t.date).toDateString(),
                    new Date(t.createdAt).toDateString(),
                ]
                    .map(escapeCSVField)
                    .join(","),
            ),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = "transactions.csv";
        link.click();

        URL.revokeObjectURL(url);
        link.remove();
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

                    {transactions.map((transaction: any) => (
                        <TableRow key={transaction.id}>
                            <TableCell>{transaction.id}</TableCell>
                            <TableCell>{transaction.title}</TableCell>
                            <TableCell>{transaction.type}</TableCell>
                            <TableCell>₹{transaction.amount}</TableCell>
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
