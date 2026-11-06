import { db, closeDb } from "@/db";
import { plans } from "@/db/schema/plans";
import { and, eq, notInArray, type InferInsertModel } from "drizzle-orm";

type PlanData = Pick<
    InferInsertModel<typeof plans>,
    "name" | "description" | "price" | "interval" | "featureLimits" | "features" | "metadata"
>;
const planData: PlanData[] = [
    {
        name: "Free",
        description:
            "For individuals organizing everyday personal apps and essential subscriptions.",
        price: "0.00",
        interval: "month" as const,
        featureLimits: {
            subscriptions: { limit: 10 },
            exports: { limit: 10, interval: "month" },
            reminders: "email",
            exportFormats: {
                csv: true,
                pdf: false,
                pdfLevel: "none",
                xlsx: false,
            },
            customCategories: false,
            taxSummaryRows: { limit: 50 },
        },
        features: [
            "Track up to 10 active subscriptions in INR",
            "Personal and Business ledger partitioning",
            "10 CSV exports per month",
            "Startard 3-day renewal alerts",
            "Encrypted in transit(TLS 1.3) and at rest(AES-256)",
        ],
        metadata: { tier: "free" },
    },
    {
        name: "Starter",
        description:
            "For growing collections, invoice archives, and detailed category breakdowns.",
        price: "129.00",
        interval: "month" as const,
        featureLimits: {
            subscriptions: { limit: 50 },
            charts: "comparative",
            exports: { limit: 100, interval: "month" },
            reminders: "email",
            exportFormats: {
                csv: true,
                pdf: true,
                pdfLevel: "basic",
                xlsx: false,
            },
            customCategories: true,
            taxSummaryRows: { limit: 500 },
        },
        features: [
            "Track up to 50 subscriptions (40 more than Free)",
            "Expense vs subscription breakdown",
            "Custom categories and renewal reminders",
            "100 CSV exports per month (10x free)",
            "Basic PDF exports per month",
        ],
        metadata: { tier: "starter" },
    },
    {
        name: "Stroka Pro",
        description:
            "For businesses, freelancers, and agencies managing GST & CA tax filing.",
        price: "299.00",
        interval: "month" as const,
        featureLimits: {
            subscriptions: { limit: -1 },
            charts: "advanced",
            exports: { limit: 1000, interval: "month" },
            reminders: "email",
            // Saved views are not built yet (coming soon); basic search and filter
            // is available on every plan, so this flag stays off for now.
            viewsAndFilters: false,
            exportFormats: {
                csv: true,
                pdf: true,
                pdfLevel: "advanced",
                xlsx: false,
            },
            customCategories: true,
            taxSummaryRows: { limit: -1 },
        },
        features: [
            "Unlimited personal & business subscriptions",
            "Tax Summary Engine (up to 400 days per request)",
            "High capacity: Up to 20,000 tagged rows per summary",
            "18% GST expense breakdown & Tax Summaries",
            "Customizable alert lead times (1, 3, 7, or 14 days)",
            "Advanced charts",
            "1,000 CSV exports per month",
            "Advanced PDF exports per month",
            "Saved views (coming soon)",
            "Monthly report (coming soon)",
            "XLSX exports (coming soon)",
        ],
        metadata: { tier: "pro" },
    },
    {
        name: "Starter Yearly",
        description:
            "For growing collections, invoice archives, and detailed category breakdowns. Billed yearly (2 months free).",
        price: "1290.00",
        interval: "year" as const,
        featureLimits: {
            subscriptions: { limit: 50 },
            charts: "comparative",
            exports: { limit: 100, interval: "month" },
            reminders: "email",
            exportFormats: {
                csv: true,
                pdf: true,
                pdfLevel: "basic",
                xlsx: false,
            },
            customCategories: true,
            taxSummaryRows: { limit: 500 },
        },
        features: [
            "Track up to 50 subscriptions (40 more than Free)",
            "Expense vs subscription breakdown",
            "Custom categories and renewal reminders",
            "100 CSV exports per month (10x free)",
            "Basic PDF exports per month",
            "Billed once per year — saves 2 months vs monthly",
        ],
        metadata: { tier: "starter", billing: "yearly" },
    },
    {
        name: "Stroka Pro Yearly",
        description:
            "For businesses, freelancers, and agencies managing GST & CA tax filing. Billed yearly (2 months free).",
        price: "2990.00",
        interval: "year" as const,
        featureLimits: {
            subscriptions: { limit: -1 },
            charts: "advanced",
            exports: { limit: 1000, interval: "month" },
            reminders: "email",
            // Saved views are not built yet (coming soon); basic search and filter
            // is available on every plan, so this flag stays off for now.
            viewsAndFilters: false,
            exportFormats: {
                csv: true,
                pdf: true,
                pdfLevel: "advanced",
                xlsx: false,
            },
            customCategories: true,
            taxSummaryRows: { limit: -1 },
        },
        features: [
            "Unlimited personal & business subscriptions",
            "Tax Summary Engine (up to 400 days per request)",
            "High capacity: Up to 20,000 tagged rows per summary",
            "18% GST expense breakdown & Tax Summaries",
            "Customizable alert lead times (1, 3, 7, or 14 days)",
            "Advanced charts",
            "1,000 CSV exports per month",
            "Advanced PDF exports per month",
            "Saved views (coming soon)",
            "Monthly report (coming soon)",
            "XLSX exports (coming soon)",
            "Billed once per year — saves 2 months vs monthly",
        ],
        metadata: { tier: "pro", billing: "yearly" },
    },
];

async function seedPlans() {
    const names = planData.map((plan) => plan.name);
    await db
        .update(plans)
        .set({ isActive: false })
        .where(
            and(
                eq(plans.currency, "INR"),
                eq(plans.isActive, true),
                notInArray(plans.name, names),
            ),
        );

    for (const plan of planData) {
        const values = {
            ...plan,
            currency: "INR",
            interval: plan.interval,
            intervalCount: 1,
            trialDays: 0,
            isActive: true,
            provider: "none" as const,
            providerPlanId: null,
        };
        const [existing] = await db
            .select({ id: plans.id })
            .from(plans)
            .where(
                and(
                    eq(plans.name, plan.name),
                    eq(plans.currency, "INR"),
                    eq(plans.interval, plan.interval),
                ),
            )
            .limit(1);

        if (existing) {
            await db.update(plans).set(values).where(eq(plans.id, existing.id));
        } else {
            await db.insert(plans).values(values);
        }
    }
}

seedPlans()
    .then(closeDb)
    .catch(async (error) => {
        console.error("Failed to seed plans:", error);
        await closeDb();
        process.exitCode = 1;
    });
