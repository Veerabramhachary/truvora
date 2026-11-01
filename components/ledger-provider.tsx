"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import {
    readStoredLedgerId,
    setActiveLedgerId,
} from "@/lib/ledger-client";

export type LedgerSummary = {
    id: string;
    type: "personal" | "business";
    name: string;
};

type LedgerContextValue = {
    ledgers: LedgerSummary[];
    active: LedgerSummary | null;
    /** True when the ledger list could not be loaded; the server then defaults to Personal. */
    loadFailed: boolean;
    selectLedger: (id: string) => void;
    createBusinessLedger: (name: string) => Promise<LedgerSummary>;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function useLedger(): LedgerContextValue {
    const value = useContext(LedgerContext);
    if (!value) throw new Error("useLedger must be used inside <LedgerProvider>");
    return value;
}

/**
 * Loads the user's ledgers and holds the active one. Children are not rendered
 * until the active ledger is known, so no request can leave without the right
 * `x-ledger-id` (a stored Business choice must never flash Personal data).
 */
export function LedgerProvider({ children }: { children: ReactNode }) {
    const [ledgers, setLedgers] = useState<LedgerSummary[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const response = await fetch("/api/ledgers", { cache: "no-store" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const list = (await response.json()) as LedgerSummary[];
                if (cancelled) return;

                const stored = readStoredLedgerId();
                const chosen =
                    list.find((ledger) => ledger.id === stored) ??
                    list.find((ledger) => ledger.type === "personal") ??
                    list[0] ??
                    null;

                setActiveLedgerId(chosen?.id ?? null);
                setLedgers(list);
                setActiveId(chosen?.id ?? null);
                setStatus("ready");
            } catch (error) {
                console.error("Could not load ledgers:", error);
                if (cancelled) return;
                // No header is sent, so the server falls back to the personal ledger.
                setActiveLedgerId(null);
                setStatus("failed");
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const selectLedger = useCallback(
        (id: string) => {
            if (!ledgers.some((ledger) => ledger.id === id)) return;
            // Update the module-level value first so the remounted tree's very
            // first requests already carry the new ledger.
            setActiveLedgerId(id);
            setActiveId(id);
        },
        [ledgers],
    );

    const createBusinessLedger = useCallback(async (name: string) => {
        const response = await fetch("/api/ledgers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        const body = (await response.json().catch(() => ({}))) as
            | LedgerSummary
            | { error?: string };
        if (!response.ok || !("id" in body)) {
            throw new Error(
                "error" in body && body.error ? body.error : "Could not create the ledger",
            );
        }
        setLedgers((current) => [...current, body]);
        setActiveLedgerId(body.id);
        setActiveId(body.id);
        return body;
    }, []);

    const value = useMemo<LedgerContextValue>(
        () => ({
            ledgers,
            active: ledgers.find((ledger) => ledger.id === activeId) ?? null,
            loadFailed: status === "failed",
            selectLedger,
            createBusinessLedger,
        }),
        [ledgers, activeId, status, selectLedger, createBusinessLedger],
    );

    if (status === "loading") {
        return (
            <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
                Loading your workspace…
            </div>
        );
    }

    return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}
