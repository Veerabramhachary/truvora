"use client";
export const dynamic = 'force-dynamic';

import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/nextjs-router";
import dataProvider from "@refinedev/simple-rest";
import { useClerkAuthProvider } from "../../providers/clerkAuthProvider";
import { LedgerProvider, useLedger } from "@/components/ledger-provider";
import { ledgerHttpClient } from "@/lib/ledger-client";

// One provider for the app's lifetime; the active ledger is added per request
// by `ledgerHttpClient`, so switching ledgers does not need a new provider.
const restDataProvider = dataProvider("/api", ledgerHttpClient);

function RefineRoot({ children }: { children: React.ReactNode }) {
    const authProvider = useClerkAuthProvider();
    const { active } = useLedger();
    return (
        <Refine
            // Remounting on a ledger switch gives Refine a fresh query cache, so
            // data from the previous ledger can never be shown under the new one.
            key={active?.id ?? "default"}
            authProvider={authProvider}
            routerProvider={routerProvider}
            dataProvider={restDataProvider}
            resources={[
                {
                    name: "transactions",
                    list: "/transactions",
                },
                {
                    name: "expenses",
                    list: "/expenses",
                    create: "/expenses",
                    edit: "/expenses/:id",
                },
                {
                    name: "subscriptions",
                    list: "/subscriptions",
                    create: "/subscriptions",
                    edit: "/subscriptions/:id",
                },
                {
                    name: "dashboard",
                    list: "/dashboard",
                },
                {
                    name: "dashboard/stats",
                    list: "/dashboard/stats",
                },
            ]}
        >
            {children}
        </Refine>
    );
}

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <LedgerProvider>
            <RefineRoot>{children}</RefineRoot>
        </LedgerProvider>
    );
}
