"use client";

import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/nextjs-router";
import dataProvider from "@refinedev/simple-rest";
import { useClerkAuthProvider } from "../providers/clerkAuthProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <Refine
            authProvider={useClerkAuthProvider()}
            routerProvider={routerProvider}
            dataProvider={dataProvider("/api")}
            resources={[
                {
                    name: "transactions",
                    list: "/api/transactions",
                    create: "/api/transactions",
                },
                {
                    name: "dashboard",
                    list: "/api/dashboard/stats",
                }
            ]}
        >
            {children}
        </Refine>
    );
}
