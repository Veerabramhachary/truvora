"use client";
export const dynamic = 'force-dynamic';

import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/nextjs-router";
import dataProvider from "@refinedev/simple-rest";
import { useClerkAuthProvider } from "../../../providers/clerkAuthProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
    const authProvider = useClerkAuthProvider()
    return (
        <Refine
            authProvider={authProvider}
            routerProvider={routerProvider}
            dataProvider={dataProvider("/api")}
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
