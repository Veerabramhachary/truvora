"use client";
import { useCustom } from "@refinedev/core";
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
    CardAction,
    CardContent,
} from "./ui/card";
import { Badge } from "./ui/badge";

const SectionCards = () => {
    const currency = "INR";

    const { query, result } = useCustom<{
        totalSpend: number;
        activeSubscriptions: number;
        totalIncome: number;
        growth: {
            totalSpend?: number;
            activeSubscriptions?: number;
            income?: number;
        };
    }>({
        url: "/api/dashboard/stats",
        method: "get",
    });
    const { isLoading, isError } = query;
    const data = result?.data ?? {};

    const format = (value: number, opts?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat("en-IN", opts).format(value);

    if (isLoading) {
        return (
            <div className="flex h-64 w-full items-center justify-center p-10">
                <p className="animate-pulse text-muted-foreground">
                    Loading stats...
                </p>
            </div>
        );
    }
    if (isError) {
        return (
            <div
                role="alert"
                className="p-10 text-destructive text-center font-medium"
            >
                Failed to load dashboard. Please refresh the page.
            </div>
        );
    }

    const {
            activeSubscriptions = 0,
        totalIncome = 0,
        growth = {},
    } = data;

    const cards = [
        {
            label: "Income",
            value: totalIncome,
            growth: growth.income,
            isMonetary: true,
        },
        {
            label: "Active Subscriptions",
            value: activeSubscriptions,
            growth: growth.activeSubscriptions,
            isMonetary: false,
        },
        {
            label: "Spend change",
            value: growth.totalSpend ?? 0,
            growth: growth.totalSpend,
            isMonetary: false,
        },
    ];

    const renderGrowthBadge = (growthValue: number | undefined) => {
        if (growthValue === undefined || growthValue === null) return null;
        const isPositive = growthValue > 0;
        const sign = isPositive ? "+" : "";
        const formatted = `${sign}${growthValue.toFixed(1)}%`;
        const badgeClass = isPositive
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800";
        return <Badge className={badgeClass}>{formatted}</Badge>;
    };

    return (
        <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
            {cards.map((card, index) => (
                <Card key={index} className="@container/card hover:bg-accent">
                    <CardHeader>
                        <CardDescription>{card.label}</CardDescription>
                        <CardTitle>
                            {
                                card.isMonetary
                                    ? format(card.value, {
                                        style: "currency",
                                        currency: currency,
                                    })
                                    : card.label === "Spend change"
                                        ? `${card.value.toFixed(1)}%`
                                        : format(card.value)
                            }
                        </CardTitle>
                        <CardAction>
                            {renderGrowthBadge(card.growth)}
                        </CardAction>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            {card.growth !== undefined
                                ? `vs last month ${card.growth > 0 ? "▲" : "▼"}`
                                : card.label === "Spend change"
                                    ? "vs last month"
                                    : "No previous data"}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

export default SectionCards;
