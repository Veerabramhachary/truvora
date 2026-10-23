"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanCard } from "./PlanCard";
import type { Plan } from "./types";

interface PricingCardsProps {
    monthlyPlans: Plan[];
    yearlyPlans: Plan[];
}

export function PricingCards({ monthlyPlans, yearlyPlans }: PricingCardsProps) {
    const [interval, setInterval] = useState<"month" | "year">("month");

    const currentPlans = interval === "month" ? monthlyPlans : yearlyPlans;

    return (
        <div className="w-full max-w-7xl mx-auto px-4">
            <Tabs
                value={interval}
                onValueChange={(value) =>
                    setInterval(value as "month" | "year")
                }
                className="w-full flex flex-col items-center"
            >
                <TabsList className="grid w-[200px] grid-cols-2">
                    <TabsTrigger value="month">Monthly</TabsTrigger>
                    <TabsTrigger value="year">Yearly</TabsTrigger>
                </TabsList>

                <TabsContent value="month" className="mt-8 w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
                        {currentPlans.map((plan) => (
                            <PlanCard
                                key={plan.id}
                                plan={plan}
                                interval={interval}
                            />
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="year" className="mt-8 w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
                        {currentPlans.map((plan) => (
                            <PlanCard
                                key={plan.id}
                                plan={plan}
                                interval={interval}
                            />
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {currentPlans.length === 0 && (
                <p className="text-center text-muted-foreground mt-8">
                    No plans available at the moment.
                </p>
            )}

            <p className="text-center text-muted-foreground text-sm mt-10">
                Payments are coming soon —{" "}
                <Link
                    href="/auth/sign-up"
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                    create a free account
                </Link>{" "}
                to start tracking your spending.
            </p>
        </div>
    );
}
