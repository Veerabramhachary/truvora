"use client";

import { useMemo } from "react";
import { useCustom } from "@refinedev/core";
import { Pie, PieChart } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

type Transaction = { id: string; amount: string | number; type: string; category?: { name?: string | null; color?: string | null } | null };

const chartConfig: ChartConfig = { amount: { label: "Spending" } };

export function CategoryExpenseChart() {
    const { query, result } = useCustom<Transaction[]>({
        url: "/api/transactions",
        method: "get",
        config: { query: { _start: 0, _end: 100, _sort: "date", _order: "desc" } },
    });
    const categories = useMemo(() => {
        const totals = new Map<string, number>();
        (Array.isArray(result?.data) ? result.data : []).filter((item) => item.type === "expense").forEach((item) => {
            const name = item.category?.name || "Uncategorized";
            totals.set(name, (totals.get(name) || 0) + Number(item.amount));
        });
        return Array.from(totals, ([name, amount], index) => ({ name, amount, fill: itemColor(index) })).sort((a, b) => b.amount - a.amount).slice(0, 6);
    }, [result]);

    return <Card className="h-full">
        <CardHeader><CardTitle>Spending by category</CardTitle><CardDescription>Where your money went recently.</CardDescription></CardHeader>
        <CardContent>
            {query.isLoading ? <Skeleton className="h-60 w-full rounded-xl" /> : query.isError ? <p className="py-8 text-center text-sm text-destructive">Unable to load category data.</p> : categories.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Add an expense to see category insights.</p> : <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-72">
                <PieChart><ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} /><Pie data={categories} dataKey="amount" nameKey="name" innerRadius={58} strokeWidth={4} /></PieChart>
            </ChartContainer>}
            <div className="mt-4 grid grid-cols-2 gap-2">
                {categories.map((item) => <div key={item.name} className="flex items-center gap-2 text-xs"><span className="size-2 rounded-full" style={{ backgroundColor: item.fill }} /><span className="truncate text-muted-foreground">{item.name}</span><span className="ml-auto font-medium">₹{item.amount.toLocaleString("en-IN")}</span></div>)}
            </div>
        </CardContent>
    </Card>;
}

function itemColor(index: number) {
    return `var(--chart-${(index % 5) + 1})`;
}
