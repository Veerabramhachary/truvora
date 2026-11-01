import axios from "axios";
import { LEDGER_HEADER } from "@/lib/ledger-header";

/**
 * Client-side "which ledger am I working in" state.
 *
 * Kept in a module variable (not only React state) so non-React code — the
 * Refine HTTP client and raw `fetch` calls — always sends the current ledger.
 * The choice is remembered per browser TAB (sessionStorage), on purpose: two
 * tabs can show different ledgers without one silently redirecting the
 * other's writes.
 */
const STORAGE_KEY = "truvora.activeLedger";

let activeLedgerId: string | null = null;

export function getActiveLedgerId(): string | null {
    return activeLedgerId;
}

export function setActiveLedgerId(id: string | null): void {
    activeLedgerId = id;
    try {
        if (id) sessionStorage.setItem(STORAGE_KEY, id);
        else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage can be unavailable (private mode, SSR); the in-memory value still works.
    }
}

export function readStoredLedgerId(): string | null {
    try {
        return sessionStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

/** `fetch` that adds the active ledger header. Use for every ledger-scoped endpoint. */
export function ledgerFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (activeLedgerId && !headers.has(LEDGER_HEADER)) {
        headers.set(LEDGER_HEADER, activeLedgerId);
    }
    return fetch(input, { ...init, headers });
}

/**
 * HTTP client handed to `@refinedev/simple-rest`, so every Refine list, form
 * and `useCustom` call carries the active ledger without per-call changes.
 */
export const ledgerHttpClient = axios.create();
ledgerHttpClient.interceptors.request.use((config) => {
    if (activeLedgerId) config.headers.set(LEDGER_HEADER, activeLedgerId);
    return config;
});
