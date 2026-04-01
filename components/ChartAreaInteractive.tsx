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

    const { result: featureResult } = useCustom<ChartTierResponse>({
        url: "/api/feature",
        method: "get",
        config: {
            query: {
                feature: "charts",
            },
        },
    });

    const { query, result: timeSeriesResult } = useCustom<TimeSeriesResponse>({
        url: "/api/dashboard/chart",
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
    const data = Array.isArray(timeSeriesResult?.data) ? timeSeriesResult : [];

    if (isLoading) {
        return (
            <div className="flex h-64 w-full items-center justify-center p-10">
                <p className="animate-pulse text-muted-foreground">
                    Loading stats...
                </p>
            </div>
        );
    }
    if (isError || !Array.isArray(data)) {
        return (
            <div
                role="alert"
                className="p-10 text-destructive text-center font-medium"
            >
                {isError ? "Failed to load dashboard." : "Received invalid data format."}
            </div>
        );
    }

    const transformedData = (timeSeriesResult?.data?.data ?? []).map((item) => ({
        date: item.date,
        expense: item.expense,
        subscription: item.subscription,
        total: (item.expense || 0) + (item.subscription || 0),
    }));

    const chartConfig: ChartConfig = {
        ...(chartTier === "basic" ? {
            total: {
                label: "Total",
                color: "var(--color-total)",
            },
        } : {}),
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
                    className="aspect-auto h-50 w-full"
                >
                    <AreaChart data={transformedData}>
                        <defs>
                            <linearGradient id="fillExpense" x1="0" y1="0" x2="0" y2="1">
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
                            dataKey={chartTier === "basic" ? "total" : "expense"}
                            type="natural"
                            fill="url(#fillExpense)"
                            stroke="var(--color-expense)"
                            stackId="a"
                        />
                        {chartTier === "comparative" && (<Area
                            dataKey="subscription"
                            type="natural"
                            fill="url(#fillSubscription)"
                            stroke="var(--color-subscription)"
                            stackId="a"
                        />)}
                        <ChartLegend content={<ChartLegendContent />} />
                    </AreaChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
