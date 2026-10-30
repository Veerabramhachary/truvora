"use client";

import dynamic from "next/dynamic";
import { useCustom } from "@refinedev/core";
import SectionCards from "@/components/SectionCards";
import { CategoryExpenseChart } from "@/components/CategoryExpenseChart";
import { RecentTransactions } from "@/components/RecentTransactions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ChartAreaInteractive = dynamic(
    () =>
        import("@/components/ChartAreaInteractive").then(
            (module) => module.ChartAreaInteractive,
        ),
    {
        ssr: false,
        loading: () => (
            <Card className="pt-0" role="status" aria-label="Loading spending chart">
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
        ),
    },
);

/*
  Deliberately not a <SidebarInset>: that component renders a <main> element,
  and app/(dashboard)/layout.tsx already wraps this in one. Nesting a second
  <main> is invalid HTML and doubled the inset padding.
*/
export default function DashboardContent() {
    const { result } = useCustom<{ totalSpend: number }>({ url: "/api/dashboard/stats", method: "get" });
    const totalSpend = result?.data?.totalSpend;
    const formattedTotal = totalSpend === undefined
        ? "—"
        : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(totalSpend);

    return (
        <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col">
                <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
                    <Card className="overflow-hidden border-primary/15 bg-primary text-primary-foreground shadow-lg shadow-primary/10">
                        <CardContent className="flex flex-col gap-2 p-6 sm:p-8">
                            <CardDescription className="text-primary-foreground/70">Total spending this month</CardDescription>
                            <CardTitle className="text-4xl tracking-tight sm:text-5xl">{formattedTotal}</CardTitle>
                            <p className="text-sm text-primary-foreground/75">Across expenses and subscriptions</p>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)] xl:items-start">
                        <ChartAreaInteractive />
                        <SectionCards />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)] xl:items-start">
                        <RecentTransactions />
                        <CategoryExpenseChart />
                    </div>
                </div>
            </div>
        </div>
    );
}
