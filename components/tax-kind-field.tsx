"use client";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useLedger } from "@/components/ledger-provider";
import {
    allowedTaxKinds,
    TAX_KIND_LABELS,
    type TaxKind,
    type TaxRecordType,
} from "@/lib/tax";

const NONE = "none";

type Props = {
    recordType: TaxRecordType;
    value: TaxKind | null | undefined;
    onChange: (next: TaxKind | null) => void;
};

/**
 * Optional "tax treatment" for a record. Tax tracking only exists on business
 * ledgers, so this renders nothing on a personal ledger (the server enforces
 * the same rule).
 */
export function TaxKindField({ recordType, value, onChange }: Props) {
    const { active } = useLedger();
    if (active?.type !== "business") return null;

    return (
        <div className="space-y-2">
            <Label htmlFor="tax-kind">Tax treatment (optional)</Label>
            <Select
                value={value ?? NONE}
                onValueChange={(next) => onChange(next === NONE ? null : (next as TaxKind))}
            >
                <SelectTrigger id="tax-kind" className="w-full">
                    <SelectValue placeholder="Not tax related" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>Not tax related</SelectItem>
                    {allowedTaxKinds(recordType).map((kind) => (
                        <SelectItem key={kind} value={kind}>
                            {TAX_KIND_LABELS[kind]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
