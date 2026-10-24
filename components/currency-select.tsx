"use client";

import { Label } from "@/components/ui/label";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

interface CurrencySelectProps {
    /** Kept in the form contract; INR is the only selectable currency. */
    value: string;
    onValueChange: (value: string) => void;
    label?: string;
    id?: string;
    errorMessage?: string;
}

export function CurrencySelect({
    value,
    label = "Currency",
    id = "currency",
    errorMessage,
}: CurrencySelectProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div id={id} className="flex h-9 w-full items-center rounded-md border px-3 text-sm">
                {value === DEFAULT_CURRENCY
                    ? "INR — Indian Rupee"
                    : `${value} — Legacy currency (no longer supported)`}
            </div>
            {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
            )}
        </div>
    );
}

export { DEFAULT_CURRENCY };
