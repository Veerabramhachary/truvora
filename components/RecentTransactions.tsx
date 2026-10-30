"use client";

import { useCustom } from "@refinedev/core";
import { ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
                <CardDescription>Your latest income and spending activity.</CardDescription>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <div className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : query.isError ? (
                    <p className="py-8 text-center text-sm text-destructive">Unable to load transactions.</p>
                ) : transactions.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center"><Receipt className="size-8 text-muted-foreground" /><p className="font-medium">No transactions yet</p><p className="text-sm text-muted-foreground">Add your first expense to see it here.</p></div>
                ) : (
                    <Table>
                        <TableHeader><TableRow><TableHead>Transaction</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {transactions.map((transaction) => {
                                const isIncome = transaction.type === "income";
                                return <TableRow key={transaction.id}>
                                    <TableCell><div className="flex items-center gap-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">{isIncome ? <ArrowUpRight className="size-4 text-emerald-600" /> : <ArrowDownLeft className="size-4 text-primary" />}</div><div className="min-w-0"><p className="truncate font-medium">{transaction.title || "Untitled"}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(transaction.date))}</p></div></div></TableCell>
                                    <TableCell><Badge variant="secondary" className="font-normal">{transaction.category?.name || "Uncategorized"}</Badge></TableCell>
                                    <TableCell className={`text-right font-medium ${isIncome ? "text-emerald-600" : ""}`}>{isIncome ? "+" : "-"}{formatAmount(transaction.amount, transaction.currency)}</TableCell>
                                </TableRow>;
                            })}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
