import { db, closeDb } from "@/db";
import { plans } from "@/db/schema/plans";
import { and, eq, notInArray, type InferInsertModel } from "drizzle-orm";

type PlanData = Pick<InferInsertModel<typeof plans>, "name" | "description" | "price" | "featureLimits" | "features" | "metadata">;
const planData: PlanData[] = [
    {
        name: "Free",
        description: "Track recurring spending and stay ahead of renewals.",
        price: "0.00",
        featureLimits: {
            subscriptions: { limit: 10 },
            exports: { limit: 10, interval: "month" },
            reminders: "email",
            exportFormats: { csv: true, pdf: false, pdfLevel: "none", xlsx: false },
            customCategories: false,
        },
        features: [
            "Track up to 10 subscriptions",
            "10 CSV exports per month",
            "Renewal reminders",
        ],
        metadata: { tier: "free" },
    },
    {
        name: "Starter",
        description: "More room to organize spending and export your data.",
        price: "99.00",
        featureLimits: {
            subscriptions: { limit: 50 },
            charts: "comparative",
            exports: { limit: 100, interval: "month" },
            reminders: "email",
            exportFormats: { csv: true, pdf: true, pdfLevel: "basic", xlsx: false },
            customCategories: true,
        },
        features: [
            "Track up to 50 subscriptions",
            "Expense vs subscription breakdown",
            "Custom categories and renewal reminders",
            "100 CSV exports per month",
            "Basic PDF exports per month",
        ],
        metadata: { tier: "starter" },
    },
    {
        name: "Pro",
        description: "Advanced insights, flexible views, and expanded exports.",
        price: "199.00",
        featureLimits: {
            subscriptions: { limit: -1 },
            charts: "advanced",
            exports: { limit: 1000, interval: "month" },
            reminders: "priority",
            viewsAndFilters: true,
            exportFormats: { csv: true, pdf: true, pdfLevel: "advanced", xlsx: true },
            customCategories: true,
        },
        features: [
            "Unlimited subscriptions",
            "Advanced charts, views, and filters",
            "Priority renewal reminders",
            "1,000 CSV exports per month",
            "Advanced PDF and XLSX exports per month",
        ],
        metadata: { tier: "pro" },
    },
];

async function seedPlans() {
    const names = planData.map((plan) => plan.name);
    await db.update(plans).set({ isActive: false }).where(
        and(eq(plans.currency, "INR"), eq(plans.isActive, true), notInArray(plans.name, names)),
    );

    for (const plan of planData) {
        const values = {
            ...plan,
            currency: "INR",
            interval: "month" as const,
            intervalCount: 1,
            trialDays: 0,
            isActive: true,
            provider: "none" as const,
            providerPlanId: null,
        };
        const [existing] = await db.select({ id: plans.id }).from(plans).where(
            and(eq(plans.name, plan.name), eq(plans.currency, "INR"), eq(plans.interval, "month")),
        ).limit(1);

        if (existing) {
            await db.update(plans).set(values).where(eq(plans.id, existing.id));
        } else {
            await db.insert(plans).values(values);
        }
    }
}

seedPlans().then(closeDb).catch(async (error) => {
    console.error("Failed to seed plans:", error);
    await closeDb();
    process.exitCode = 1;
});
