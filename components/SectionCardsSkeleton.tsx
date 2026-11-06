"use client";
import { Skeleton } from "./ui/skeleton";
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
    CardAction,
    CardContent,
} from "./ui/card";

const SectionCardsSkeleton = () => {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:h-full xl:grid-cols-1 xl:grid-rows-3 min-h-[280px]">
            <span className="sr-only">Loading dashboard cards</span>
            {/* Income */}
            <Card className="@container/card min-h-0 gap-2 py-3">
                <CardHeader className="gap-1 px-3 py-0 sm:px-4">
                    <CardDescription className="text-xs leading-5 sm:text-sm">
                        <Skeleton className="h-4 w-20 sm:w-24" />
                    </CardDescription>
                    <CardTitle className="text-xl leading-tight tabular-nums sm:text-2xl">
                        <Skeleton className="h-8 w-24 sm:h-9 sm:w-32" />
                    </CardTitle>
                    <CardAction>
                        <Skeleton className="h-5 w-12 rounded-full" />
                    </CardAction>
                </CardHeader>
                <CardContent className="px-3 sm:px-4">
                    <Skeleton className="h-4 w-3/4" />
                </CardContent>
            </Card>
            {/* Active Subscriptions */}
            <Card className="@container/card min-h-0 gap-2 py-3">
                <CardHeader className="gap-1 px-3 py-0 sm:px-4">
                    <CardDescription className="text-xs leading-5 sm:text-sm">
                        <Skeleton className="h-4 w-24 sm:w-32" />
                    </CardDescription>
                    <CardTitle className="text-xl leading-tight tabular-nums sm:text-2xl">
                        <Skeleton className="h-8 w-16 sm:h-9 sm:w-24" />
                    </CardTitle>
                    <CardAction>
                        <Skeleton className="h-5 w-12 rounded-full" />
                    </CardAction>
                </CardHeader>
                <CardContent className="px-3 sm:px-4">
                    <Skeleton className="h-4 w-3/4" />
                </CardContent>
            </Card>
            {/* Upcoming subscriptions (full width card) */}
            <Card className="@container/card min-h-0 gap-2 py-3 col-span-2 sm:col-span-1">
                <CardHeader className="gap-1 px-3 py-0 sm:px-4">
                    <CardDescription className="text-xs leading-5 sm:text-sm">
                        <Skeleton className="h-4 w-24 sm:w-32" />
                    </CardDescription>
                    <CardTitle className="text-xl leading-tight tabular-nums sm:text-2xl">
                        <Skeleton className="h-8 w-20 sm:h-9 sm:w-28" />
                    </CardTitle>
                    <CardAction />
                </CardHeader>
                <CardContent className="px-3 sm:px-4">
                    <Skeleton className="h-4 w-1/2" />
                </CardContent>
            </Card>
        </div>
    );
};

export default SectionCardsSkeleton;
