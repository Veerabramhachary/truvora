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
        upcomingSubscriptions?: number;
        nextRenewal?: { name: string; date: string } | null;
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

    const formatDate = (value: string | Date) =>
        new Intl.DateTimeFormat("en-IN", {
            day: "numeric",
            month: "short",
        }).format(new Date(value));

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
        upcomingSubscriptions = 0,
        nextRenewal = null,
        growth = {},
    } = data;

    const cards = [
        {
            label: "Income",
            value: format(totalIncome, {
                style: "currency",
                currency: currency,
            }),
            growth: growth.income,
            note:
                growth.income !== undefined
                    ? `vs last month ${growth.income > 0 ? "▲" : "▼"}`
                    : "No previous data",
        },
        {
            label: "Active Subscriptions",
            value: format(activeSubscriptions),
            growth: growth.activeSubscriptions,
            note:
                growth.activeSubscriptions !== undefined
                    ? `vs last month ${growth.activeSubscriptions > 0 ? "▲" : "▼"}`
                    : "No previous data",
        },
        {
            label: "Upcoming subscriptions",
            value: format(upcomingSubscriptions),
            growth: undefined,
            note: nextRenewal
                ? `Next: ${nextRenewal.name} · ${formatDate(nextRenewal.date)}`
                : "No renewals in the next 7 days",
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
                        <CardTitle>{card.value}</CardTitle>
                        <CardAction>
                            {renderGrowthBadge(card.growth)}
                        </CardAction>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            {card.note}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

export default SectionCards;
