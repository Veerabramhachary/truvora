import { Suspense } from "react";
import { PricingCards } from "./PricingCards";
import { PricingSkeleton } from "./PricingSkeleton";
import { db } from "@/db";
import { plans } from "@/db/schema/plans";
import { and, eq } from "drizzle-orm";
import { Plan } from "./types";
import { DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/currencies";

// Title renders as "Pricing · Truvora" via the root layout's template.
export const metadata = {
    title: "Pricing",
    description:
        "Explore Truvora plans. The free plan is available now; paid checkout is coming soon.",
};

async function getPlans(
    interval: "month" | "year",
    currency: CurrencyCode,
): Promise<{ data: Plan[]; error: boolean }> {
    try {
        const rows = await db
            .select()
            .from(plans)
            .where(
                and(
                    eq(plans.currency, currency),
                    eq(plans.interval, interval),
                    eq(plans.isActive, true),
                ),
            )
            .orderBy(plans.price);
        const data: Plan[] = rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description ?? "No description available",
            currency: row.currency,
            price: Number(row.price), // convert string to number
            interval: row.interval as "month" | "year",
            intervalCount: row.intervalCount,
            features: row.features ?? [], // ensure array, default empty
            isActive: row.isActive ?? false,
            providerPlanId: row.providerPlanId ?? null,
            createdAt: row.createdAt ?? new Date(),
            updatedAt: row.updatedAt ?? new Date(),
        }));
        return { data, error: false };
    } catch (error) {
        // Logged rather than swallowed: an empty pricing grid with no trace in
        // the build logs is how a broken `DATABASE_URL` goes unnoticed.
        console.error("Failed to load pricing plans:", error);
        return { data: [], error: true };
    }
}

async function PricingCardsLoader({ currency }: { currency: CurrencyCode }) {
    const [monthlyResult, yearlyResult] = await Promise.all([
        getPlans("month", currency),
        getPlans("year", currency),
    ]);
    if (monthlyResult.error || yearlyResult.error) {
        return <PricingCards monthlyPlans={[]} yearlyPlans={[]} />;
    }
    return (
        <PricingCards
            monthlyPlans={monthlyResult.data}
            yearlyPlans={yearlyResult.data}
        />
    );
}

export default async function PricingPage() {

    return (
        <section className="flex flex-col w-full min-h-screen items-center gap-10 py-10 bg-background">
            <div className="flex flex-col items-center text-center px-4">
                <h1 className="font-bold text-4xl md:text-5xl text-foreground">
                    Choose Your Plan
                </h1>
                <p className="text-muted-foreground text-lg mt-2 max-w-2xl">
                    Affordable and adaptable pricing to suit your goals
                </p>
                <p className="mt-3 text-sm text-muted-foreground">All prices in Indian Rupees (INR)</p>
            </div>

            <Suspense fallback={<PricingSkeleton />}>
                <PricingCardsLoader currency={DEFAULT_CURRENCY} />
            </Suspense>
        </section>
    );
}
