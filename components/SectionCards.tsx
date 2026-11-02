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
            activeSubscriptions?: number | null;
            income?: number | null;
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
            <div className="flex min-h-[280px] w-full items-center justify-center p-8 xl:h-full">
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
                className="flex min-h-[280px] items-center justify-center p-8 text-center font-medium text-destructive xl:h-full"
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
            note: totalIncome === 0
                ? "No income recorded this month"
                : growth.income == null
                  ? "No previous month to compare"
                  : "Income received this month",
        },
        {
            label: "Active Subscriptions",
            value: format(activeSubscriptions),
            growth: growth.activeSubscriptions,
            note: activeSubscriptions === 0
                ? "No active subscriptions"
                : growth.activeSubscriptions == null
                  ? "No previous month to compare"
                  : "Currently active",
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

    const renderGrowthBadge = (
        growthValue: number | null | undefined,
    ) => {
        if (growthValue === undefined || growthValue === null) return null;
        const isPositive = growthValue > 0;
        const sign = isPositive ? "+" : "";
        const formatted = `${sign}${growthValue.toFixed(1)}%`;
        const badgeClass = growthValue === 0
            ? "bg-muted text-muted-foreground"
            : isPositive
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800";
        return <Badge className={badgeClass}>{formatted}</Badge>;
    };

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:h-full xl:grid-cols-1 xl:grid-rows-3 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
            {cards.map((card) => (
                <Card key={card.label} className={`@container/card min-h-0 gap-2 py-3 hover:bg-accent ${card.label === "Upcoming subscriptions" ? "col-span-2 sm:col-span-1" : ""}`}>
                    <CardHeader className="gap-1 px-3 py-0 sm:px-4">
                        <CardDescription className="text-xs leading-5 sm:text-sm">{card.label}</CardDescription>
                        <CardTitle className="text-xl leading-tight tabular-nums sm:text-2xl">{card.value}</CardTitle>
                        <CardAction>
                            {renderGrowthBadge(card.growth)}
                        </CardAction>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-4">
                        <p className="line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1 sm:text-sm">
                            {card.note}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

export default SectionCards;
