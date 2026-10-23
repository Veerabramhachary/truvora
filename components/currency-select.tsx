"use client";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currencies";

interface CurrencySelectProps {
    /** Controlled value — required so an edit form can show the row's existing
     * currency instead of silently snapping back to USD. */
    value: string;
    onValueChange: (value: string) => void;
    label?: string;
    id?: string;
    errorMessage?: string;
}

export function CurrencySelect({
    value,
    onValueChange,
    label = "Currency",
    id = "currency",
    errorMessage,
}: CurrencySelectProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {CURRENCIES.map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                            {currency.code} — {currency.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
            )}
        </div>
    );
}

export { DEFAULT_CURRENCY };
