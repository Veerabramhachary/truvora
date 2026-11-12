"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    ToggleGroup,
    ToggleGroupItem,
} from "@/components/ui/toggle-group";

type Interval = "month" | "year";

/**
 * Client-side Monthly / Annual billing toggle.
 *
 * Reads the `interval` search param directly (derived state, no effect sync)
 * and pushes `/billing?interval=month|year` when the user switches. The
 * server page re-renders with the matching plan set.
 */
export function BillingIntervalToggle({
    currentInterval,
}: {
    currentInterval: Interval;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const urlInterval = searchParams.get("interval");
    const interval: Interval =
        urlInterval === "month" || urlInterval === "year"
            ? urlInterval
            : currentInterval;

    const switchInterval = (next: Interval) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("interval", next);
        router.push(`/billing?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="flex items-center gap-2">
            <ToggleGroup
                type="single"
                value={interval}
                onValueChange={(value) => {
                    if (value === "month" || value === "year") {
                        switchInterval(value);
                    }
                }}
            >
                <ToggleGroupItem value="month">Monthly Billing</ToggleGroupItem>
                <ToggleGroupItem value="year">
                    Annual Billing
                    <span className="ml-1 text-xs font-medium opacity-80">
                        2 Months Free
                    </span>
                </ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}
