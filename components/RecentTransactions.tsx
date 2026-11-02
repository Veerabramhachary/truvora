"use client";

import { useCustom } from "@refinedev/core";
import { ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayCategoryName } from "@/lib/categories";

type Transaction = {
    id: string;
    title: string;
    amount: string | number;
    type: "expense" | "income" | "subscription";
    currency: string;
    date: string;
    category?: { name?: string | null; color?: string | null } | null;
};

const formatAmount = (amount: string | number, currency: string) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(amount));

export function RecentTransactions() {
    const { query, result } = useCustom<Transaction[]>({
        url: "/api/transactions",
        method: "get",
        config: { query: { _start: 0, _end: 6, _sort: "date", _order: "desc" } },
    });

    const transactions = Array.isArray(result?.data) ? result.data : [];

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Recent transactions</CardTitle>
                <CardDescription className="text-pretty">Your latest income and spending activity.</CardDescription>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <div className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : query.isError ? (
                    <p className="py-8 text-center text-sm text-destructive">Unable to load transactions.</p>
                ) : transactions.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center"><Receipt className="size-8 text-muted-foreground" /><p className="font-medium">No transactions yet</p><p className="text-sm text-muted-foreground">Add your first expense to see it here.</p></div>
                ) : (
                    <>
                    <ul className="divide-y sm:hidden">
                        {transactions.map((transaction) => {
                            const isIncome = transaction.type === "income";
                            return (
                                <li key={transaction.id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                                            {isIncome ? <ArrowUpRight aria-hidden="true" className="size-4 text-emerald-600" /> : <ArrowDownLeft aria-hidden="true" className="size-4 text-red-600" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">{displayCategoryName(transaction.title || "Untitled")}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {displayCategoryName(transaction.category?.name || "Uncategorized")}
                                                {" · "}
                                                {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(transaction.date))}
                                            </span>
                                        </span>
                                    </div>
                                    <span className={`shrink-0 text-right text-sm font-medium tabular-nums ${isIncome ? "text-emerald-600" : "text-red-600"}`}>
                                        {isIncome ? "+" : "-"}{formatAmount(transaction.amount, transaction.currency)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="hidden max-w-full overflow-x-auto sm:block">
                        <Table className="mx-auto min-w-[34rem]">
                            <TableHeader>
                                <TableRow className="align-middle">
                                    <TableHead className="align-middle">Transaction</TableHead>
                                    <TableHead className="align-middle">Category</TableHead>
                                    <TableHead className="text-right align-middle">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.map((transaction) => {
                                    const isIncome = transaction.type === "income";
                                    return <TableRow key={transaction.id} className="align-middle">
                                        <TableCell className="align-middle"><div className="flex items-center gap-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">{isIncome ? <ArrowUpRight aria-hidden="true" className="size-4 text-emerald-600" /> : <ArrowDownLeft aria-hidden="true" className="size-4 text-red-600" />}</div><div className="min-w-0"><p className="truncate font-medium">{transaction.title || "Untitled"}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(transaction.date))}</p></div></div></TableCell>
                                        <TableCell className="align-middle"><Badge variant="secondary" className="font-normal">{displayCategoryName(transaction.category?.name || "Uncategorized")}</Badge></TableCell>
                                        <TableCell className={`text-right align-middle font-medium ${isIncome ? "text-emerald-600" : "text-red-600"}`}><span className="sr-only">{isIncome ? "Income" : "Expense"}: </span>{isIncome ? "+" : "-"}{formatAmount(transaction.amount, transaction.currency)}</TableCell>
                                    </TableRow>;
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
