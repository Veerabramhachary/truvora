"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currencies";

/**
 * Rewrites `?currency=` on the pricing URL. The page reads it server-side, so
 * switching currency re-fetches the plans that actually exist for that
 * currency rather than silently re-labelling USD amounts.
 */
export function CurrencySwitcher({ value }: { value: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    return (
        <Select
            value={value}
            onValueChange={(next) => {
                const params = new URLSearchParams(searchParams.toString());
                if (next === DEFAULT_CURRENCY) {
                    params.delete("currency");
                } else {
                    params.set("currency", next);
                }
                const query = params.toString();
                router.push(query ? `/pricing?${query}` : "/pricing");
            }}
        >
            <SelectTrigger
                className="w-[190px]"
                aria-label="Display prices in"
            >
                <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
                {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                        {currency.code} — {currency.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
