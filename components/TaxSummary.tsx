"use client";

import { useMemo, useState } from "react";
import { useCustom } from "@refinedev/core";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/currencies";
import {
    currentTaxYearStart,
    taxYearBounds,
    taxYearLabel,
    type TaxSummary as TaxSummaryData,
} from "@/lib/tax";

type Response = TaxSummaryData & { currency: string; truncated: boolean };

const chartConfig: ChartConfig = {
    deductible: { label: "Deductible", color: "var(--chart-1)" },
    taxPaid: { label: "Tax paid", color: "var(--chart-2)" },
    taxableIncome: { label: "Taxable income", color: "var(--chart-3)" },
};

function monthLabel(key: string): string {
    const [year, month] = key.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", {
        month: "short",
        timeZone: "UTC",
    });
}

/**
 * Tax summary for a BUSINESS ledger (April–March tax year): totals by tax
 * type and a month-by-month chart of the records tagged with a tax treatment.
 * The dashboard only renders this when the active ledger is a business one.
 */
export function TaxSummary() {
    const years = useMemo(() => {
        const current = currentTaxYearStart();
        return [current, current - 1, current - 2, current - 3];
    }, []);
    const [startYear, setStartYear] = useState(years[0]);

    const query = useMemo(() => {
        const { from, to } = taxYearBounds(startYear);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            tzOffset: from.getTimezoneOffset(),
            currency: "INR",
        };
    }, [startYear]);

    const { query: request, result } = useCustom<Response>({
        url: "/api/tax/summary",
        method: "get",
        config: { query },
    });
    const data = result?.data;

    const counts = data?.counts ?? { deductible: 0, tax_paid: 0, taxable_income: 0, tax_refund: 0 };
    const totals = data?.totals ?? { deductible: 0, taxPaid: 0, taxableIncome: 0, taxRefund: 0, netTaxPaid: 0 };

    const tagged = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const money = (value: number) => formatCurrency(value, "INR");
    const chartData = (data?.months ?? []).map((month) => ({
        month: monthLabel(month.key),
        deductible: month.deductible,
        taxPaid: month.taxPaid,
        taxableIncome: month.taxableIncome,
    }));

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle>Tax summary</CardTitle>
                    <CardDescription>
                        Records you tagged with a tax treatment. Tax year runs April to March.
                    </CardDescription>
                </div>
                <Select value={String(startYear)} onValueChange={(value) => setStartYear(Number(value))}>
                    <SelectTrigger className="w-full sm:w-40" aria-label="Tax year">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {years.map((year) => (
                            <SelectItem key={year} value={String(year)}>
                                {taxYearLabel(year)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent className="space-y-6">
                {request.isLoading && !data ? (
                    <Skeleton className="h-56 w-full rounded-xl" />
                ) : request.isError ? (
                    <p role="alert" className="py-8 text-center text-sm text-destructive">
                        Unable to load the tax summary.
                    </p>
                ) : !data || tagged === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                        Nothing tagged for {taxYearLabel(startYear)} yet. Choose a tax treatment when you add or edit
                        an expense, income or subscription.
                    </p>
                ) : (
                    <>
                        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                            <Tile label="Deductible" value={money(totals.deductible)} note={`${counts.deductible} records`} />
                            <Tile label="Taxable income" value={money(totals.taxableIncome)} note={`${counts.taxable_income} records`} />
                            <Tile label="Tax paid" value={money(totals.taxPaid)} note={`${counts.tax_paid} records`} />
                            <Tile label="Tax refunds" value={money(totals.taxRefund)} note={`${counts.tax_refund} records`} />
                            <Tile label="Net tax paid" value={money(totals.netTaxPaid)} note="Paid minus refunds" />
                        </dl>

                        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
                            <BarChart data={chartData} accessibilityLayer>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="deductible" fill="var(--color-deductible)" radius={3} />
                                <Bar dataKey="taxPaid" fill="var(--color-taxPaid)" radius={3} />
                                <Bar dataKey="taxableIncome" fill="var(--color-taxableIncome)" radius={3} />
                            </BarChart>
                        </ChartContainer>

                        {data.truncated && (
                            <p className="text-xs text-muted-foreground">
                                This year has more tagged records than can be summarised at once; totals may be incomplete.
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
    return (
        <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
            <p className="text-xs text-muted-foreground">{note}</p>
        </div>
    );
}
