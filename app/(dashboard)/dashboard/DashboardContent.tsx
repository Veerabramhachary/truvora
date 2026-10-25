"use client";

import dynamic from "next/dynamic";
import SectionCards from "@/components/SectionCards";
import {
    Card,
    CardContent,
    CardHeader,
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
    return (
        <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                    <div className="px-4 lg:px-6">
                        <SectionCards />
                    </div>
                    <div className="px-4 lg:px-6">
                        <ChartAreaInteractive />
                    </div>
                </div>
            </div>
        </div>
    );
}
