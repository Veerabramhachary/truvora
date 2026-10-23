"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

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
import { useState, useMemo } from "react";
import { useCustom } from "@refinedev/core";
import { Skeleton } from "@/components/ui/skeleton";

export const description = "An interactive area chart";

type ChartDatePoint = {
    date: string;
    expense: number;
    subscription: number;
};
type ChartTierResponse = {
    allowed: boolean;
    limit?: "basic" | "comparative";
};
type TimeSeriesResponse = ChartDatePoint[];

export function ChartAreaInteractive() {
    const [timeRange, setTimeRange] = useState("30d");

    const getDateRange = useMemo(() => {
        const now = new Date();
        let daysToSubtract = 30;
        if (timeRange === "90d") {
            daysToSubtract = 90;
        }
        if (timeRange === "7d") {
            daysToSubtract = 7;
        }

        const endDate = new Date(now);
        endDate.setUTCHours(23, 59, 59, 999);
        const startDate = new Date(now);
        startDate.setUTCDate(now.getUTCDate() - daysToSubtract);
        startDate.setUTCHours(0, 0, 0, 0);
        return { startDate, endDate };
    }, [timeRange]);

    const { result: featureResult, query: tierQuery } =
        useCustom<ChartTierResponse>({
            url: "/api/feature",
            method: "get",
            config: {
                query: {
                    feature: "charts",
                },
            },
        });

    const { query, result: timeSeriesResult } = useCustom<TimeSeriesResponse>({
        url: "/api/dashboard/charts",
        method: "get",
        config: {
            query: {
                startDate: getDateRange.startDate.toISOString(),
                endDate: getDateRange.endDate.toISOString(),
                currency: "USD",
            },
        },
        queryOptions: {
            enabled: !!featureResult?.data?.limit,
        },
    });

    const chartTier = featureResult?.data?.limit ?? null;
    const { isLoading, isError } = query;
    const data = Array.isArray(timeSeriesResult?.data)
        ? timeSeriesResult.data
        : [];

    if (isLoading || tierQuery.isLoading) {
        return <ChartSkeleton />;
    }
    if (tierQuery.isError) {
        return (
            <div
                role="alert"
                className="p-10 text-destructive text-center font-medium"
            >
                Failed to load chart access. Please refresh the page.
            </div>
        );
    }
    if (
        isError ||
        (timeSeriesResult?.data && !Array.isArray(timeSeriesResult?.data))
    ) {
        return (
            <div
                role="alert"
                className="p-10 text-destructive text-center font-medium"
            >
                {isError
                    ? "Failed to load spending history."
                    : "Received invalid data format."}
            </div>
        );
    }

    /*
      The chart query is gated on the feature response, so these two states have
      to be handled explicitly rather than falling through to a zeroed chart.
      Previously a brand-new account rendered an error here — no plan meant no
      tier meant the query never ran, and "no data" was indistinguishable from a
      failure.
    */
    if (chartTier === null) {
        return (
            <div className="flex h-64 flex-col items-center justify-center gap-2 p-10 text-center">
                <p className="font-medium text-foreground">
                    Charts aren&apos;t included in your plan
                </p>
                <p className="text-sm text-muted-foreground">
                    Upgrade to see your spending over time.
                </p>
            </div>
        );
    }

    const hasSpend = data.some(
        (d) => (d.expense || 0) > 0 || (d.subscription || 0) > 0,
    );
    if (!hasSpend) {
        return (
            <Card className="pt-0">
                <CardHeader className="flex items-center gap-2 space-y-0 border-b py-4 sm:flex-row">
                    <div className="grid flex-1 gap-1">
                        <CardTitle>
                            {chartTier === "basic"
                                ? "Total Spend"
                                : "Expenses & Subscriptions"}
                        </CardTitle>
                        <CardDescription>
                            Choose a different range to view spending history.
                        </CardDescription>
                    </div>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger
                            className="w-40 rounded-lg sm:ml-auto"
                            aria-label="Select a time range"
                        >
                            <SelectValue placeholder="Last 3 months" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="90d" className="rounded-lg">
                                Last 3 months
                            </SelectItem>
                            <SelectItem value="30d" className="rounded-lg">
                                Last 30 days
                            </SelectItem>
                            <SelectItem value="7d" className="rounded-lg">
                                Last 7 days
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent className="flex h-64 flex-col items-center justify-center gap-2 p-10 text-center">
                    <p className="font-medium text-foreground">
                        Nothing to chart yet
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Add an expense or try a wider date range.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const transformedData = data.map((item) => ({
        date: item.date,
        expense: item.expense,
        subscription: item.subscription,
        total: (item.expense || 0) + (item.subscription || 0),
    }));

    const chartConfig: ChartConfig = {
        ...(chartTier === "basic"
            ? {
                  total: {
                      label: "Total",
                      color: "var(--color-total)",
                  },
              }
            : {}),
        ...(chartTier === "comparative" && {
            subscription: {
                label: "Subscriptions",
                color: "var(--chart-2)",
            },
            expense: {
                label: "Expenses",
                color: "var(--chart-1)",
            },
        }),
    };

    return (
        <Card className="pt-0">
            <CardHeader className="flex items-center gap-2 space-y-0 border-b py-4 sm:flex-row">
                <div className="grid flex-1 gap-1">
                    <CardTitle>
                        {chartTier === "basic"
                            ? "Total Spend"
                            : "Expenses & Subscriptions"}
                    </CardTitle>
                    <CardDescription>
                        Showing{" "}
                        {chartTier === "basic"
                            ? "total spending"
                            : "expenses & subscriptions breakdown"}
                        over time
                    </CardDescription>
                </div>
                <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger
                        className="hidden w-40 rounded-lg sm:ml-auto sm:flex"
                        aria-label="Select a value"
                    >
                        <SelectValue placeholder="Last 3 months" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                        <SelectItem value="90d" className="rounded-lg">
                            Last 3 months
                        </SelectItem>
                        <SelectItem value="30d" className="rounded-lg">
                            Last 30 days
                        </SelectItem>
                        <SelectItem value="7d" className="rounded-lg">
                            Last 7 days
                        </SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent
                className="px-2 pt-4 sm:px-6 sm:pt-6"
                style={{ minHeight: "300px" }}
            >
                <ChartContainer
                    config={chartConfig}
                    className="aspect-auto h-52 w-full"
                >
                    <AreaChart data={transformedData}>
                        <defs>
                            {chartTier === "basic" ? (
                                <linearGradient
                                    id="fillTotal"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="5%"
                                        stopColor="var(--color-total)"
                                        stopOpacity={0.8}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor="var(--color-total)"
                                        stopOpacity={0.1}
                                    />
                                </linearGradient>
                            ) : (
                                <linearGradient
                                    id="fillExpense"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="5%"
                                        stopColor="var(--color-expense)"
                                        stopOpacity={0.8}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor="var(--color-expense)"
                                        stopOpacity={0.1}
                                    />
                                </linearGradient>
                            )}
                            {chartTier === "comparative" && (
                                <linearGradient
                                    id="fillSubscription"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="5%"
                                        stopColor="var(--color-subscription)"
                                        stopOpacity={0.8}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor="var(--color-subscription)"
                                        stopOpacity={0.1}
                                    />
                                </linearGradient>
                            )}
                        </defs>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            minTickGap={32}
                            tickFormatter={(value) => {
                                const date = new Date(value);
                                return date.toLocaleDateString("en-IN", {
                                    month: "short",
                                    day: "numeric",
                                });
                            }}
                        />
                        <ChartTooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(value) => {
                                        return new Date(
                                            value,
                                        ).toLocaleDateString("en-IN", {
                                            month: "short",
                                            day: "numeric",
                                        });
                                    }}
                                    indicator="dot"
                                />
                            }
                        />
                        <Area
                            dataKey={
                                chartTier === "basic" ? "total" : "expense"
                            }
                            type="natural"
                            fill={
                                chartTier === "basic"
                                    ? "url(#fillTotal)"
                                    : "url(#fillExpense)"
                            }
                            stroke={
                                chartTier === "basic"
                                    ? "var(--color-total)"
                                    : "var(--color-expense)"
                            }
                            stackId="a"
                        />
                        {chartTier === "comparative" && (
                            <Area
                                dataKey="subscription"
                                type="natural"
                                fill="url(#fillSubscription)"
                                stroke="var(--color-subscription)"
                                stackId="a"
                            />
                        )}
                        <ChartLegend content={<ChartLegendContent />} />
                    </AreaChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}

/**
 * Matches the real card's footprint — header row plus the 208px plot area —
 * so nothing shifts when the data lands.
 */
function ChartSkeleton() {
    return (
        <Card className="pt-0">
            <CardHeader className="flex items-center gap-2 space-y-0 border-b py-4 sm:flex-row">
                <div className="grid flex-1 gap-2">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-64 max-w-full" />
                </div>
                <Skeleton className="ml-auto hidden h-9 w-40 rounded-lg sm:block" />
            </CardHeader>
            <CardContent
                className="px-2 pt-4 sm:px-6 sm:pt-6"
                style={{ minHeight: "300px" }}
            >
                <Skeleton className="h-52 w-full rounded-xl" />
            </CardContent>
        </Card>
    );
}
