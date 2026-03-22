"use client";
import { useCustom } from "@refinedev/core";
import { useFormatter } from "next-intl";
import { useSearchParams } from "next/navigation";
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
    const searchParams = useSearchParams();
    const currency = searchParams.get("currency") || "USD";

    const { query, result } = useCustom<{
        totalSpend: number;
        activeSubscriptions: number;
        totalIncome: number;
        growth: any;
    }>({
        url: "/api/dashoard/stats",
        method: "get",
    });
    const { isLoading, isError } = query;
    const data = result?.data ?? {};

    const format = useFormatter();

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
        totalSpend = 0,
        activeSubscriptions = 0,
        totalIncome = 0,
        growth = {},
    } = data;

    const cards = [
        {
            label: "Total Spend",
            value: totalSpend,
            growth: growth.totalSpend,
            isMonetary: true,
        },
        {
            label: "Active Subscriptions",
            value: activeSubscriptions,
            growth: growth.activeSubscriptions,
            isMonetary: false,
        },
        {
            label: "Income",
            value: totalIncome,
            growth: growth.income,
            isMonetary: true,
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
        <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
            {cards.map((card, index) => (
                <Card key={index} className="@container/card">
                    <CardHeader>
                        <CardDescription>{card.label}</CardDescription>
                        <CardTitle>
                            {
                                card.isMonetary
                                    ? format.number(card.value, {
                                          style: "currency",
                                          currency: currency,
                                      })
                                    : format.number(card.value) // plain number with locale grouping
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
                                : "No previous data"}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

export default SectionCards;
