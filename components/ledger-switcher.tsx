"use client";

import { useState, type FormEvent } from "react";
import { Briefcase, Check, ChevronsUpDown, Plus, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLedger, type LedgerSummary } from "@/components/ledger-provider";

function LedgerIcon({ type }: { type: LedgerSummary["type"] }) {
    const Icon = type === "business" ? Briefcase : User;
    return <Icon className="size-4 shrink-0" aria-hidden />;
}

export function LedgerSwitcher() {
    const { ledgers, active, selectLedger, createBusinessLedger } = useLedger();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);

    const hasBusiness = ledgers.some((ledger) => ledger.type === "business");

    async function handleCreate(event: FormEvent) {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || saving) return;

        setSaving(true);
        try {
            const created = await createBusinessLedger(trimmed);
            toast.success(`Switched to ${created.name}`);
            setDialogOpen(false);
            setName("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create the ledger");
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="max-w-48 gap-2"
                        aria-label="Switch between personal and business records"
                    >
                        {active && <LedgerIcon type={active.type} />}
                        <span className="truncate">{active?.name ?? "Personal"}</span>
                        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Your records</DropdownMenuLabel>
                    {ledgers.map((ledger) => (
                        <DropdownMenuItem
                            key={ledger.id}
                            onSelect={() => selectLedger(ledger.id)}
                            className="gap-2"
                        >
                            <LedgerIcon type={ledger.type} />
                            <span className="flex-1 truncate">{ledger.name}</span>
                            {ledger.id === active?.id && <Check className="size-4" aria-hidden />}
                        </DropdownMenuItem>
                    ))}
                    {!hasBusiness && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setDialogOpen(true)} className="gap-2">
                                <Plus className="size-4" aria-hidden />
                                Add business
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add your business</DialogTitle>
                        <DialogDescription>
                            Business income, expenses and subscriptions are kept completely separate
                            from your personal records.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="business-name">Business name</Label>
                            <Input
                                id="business-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                maxLength={40}
                                placeholder="e.g. Acme Studio"
                                autoFocus
                            />
                        </div>
                        <Button type="submit" disabled={saving || !name.trim()}>
                            {saving ? "Creating…" : "Create business"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
