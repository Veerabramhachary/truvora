import { closeDb, db } from "@/db";
import { categories } from "../db/schema/schema";
import { plans } from "../db/schema/plans";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import {
    expenseCategories,
    incomeCategories,
    subscriptionsCategories,
} from "@/lib/categories";

/*
  Plans used to be absent entirely, which broke the whole feature-gate chain:
  the Clerk webhook looks up the cheapest active plan to grant new users, and
  `getSubscriptionGate` inner-joins `plans` — an empty table meant no
  subscription row could ever be created, and every gate saw "no plan". Charts,
  exports and the subscription limit all read from here.

  `plans.name` has no unique constraint, so match-then-write instead of using
  an upsert. Run this after `db:push`.
*/
const PLAN_TIERS = [
    {
        name: "Free",
        description: "Track recurring spending and stay ahead of renewals.",
        price: "0.00",
        featureLimits: {
            exports: { limit: 10, interval: "month" as const },
            subscriptions: { limit: 10 },
            reminders: "email" as const,
            exportFormats: { csv: true, pdf: false, pdfLevel: "none" as const, xlsx: false },
            customCategories: false,
        },
        features: [
            "Track up to 10 subscriptions",
            "10 CSV exports per month",
            "Renewal reminders",
        ],
    },
    {
        name: "Starter",
        description: "More room to organize spending and export your data.",
        price: "99.00",
        featureLimits: {
            exports: { limit: 100, interval: "month" as const },
            subscriptions: { limit: 50 },
            charts: "comparative" as const,
            reminders: "email" as const,
            exportFormats: { csv: true, pdf: true, pdfLevel: "basic" as const, xlsx: false },
            customCategories: true,
        },
        features: [
            "Track up to 50 subscriptions",
            "Expense vs subscription breakdown",
            "Custom categories and renewal reminders",
            "100 CSV exports per month",
            "Basic PDF exports per month",
        ],
    },
    {
        name: "Pro",
        description: "Advanced insights, flexible views, and expanded exports.",
        price: "199.00",
        featureLimits: {
            exports: { limit: 1000, interval: "month" as const },
            subscriptions: { limit: -1 },
            charts: "advanced" as const,
            reminders: "priority" as const,
            viewsAndFilters: true,
            exportFormats: { csv: true, pdf: true, pdfLevel: "advanced" as const, xlsx: true },
            customCategories: true,
        },
        features: [
            "Unlimited subscriptions",
            "Advanced charts, views, and filters",
            "Priority renewal reminders",
            "1,000 CSV exports per month",
            "Advanced PDF and XLSX exports per month",
        ],
    },
] as const;

export const seedPlans = async () => {
    try {
        console.log("Seeding plans...");

        const names = PLAN_TIERS.map((plan) => plan.name);
        await db.update(plans).set({ isActive: false }).where(
            and(eq(plans.currency, "INR"), eq(plans.isActive, true), notInArray(plans.name, names)),
        );

        for (const tier of PLAN_TIERS) {
            const values = {
                name: tier.name,
                description: tier.description,
                price: tier.price,
                currency: "INR",
                interval: "month" as const,
                features: [...tier.features],
                featureLimits: tier.featureLimits,
                isActive: true,
                intervalCount: 1,
                trialDays: 0,
                // Not a gateway plan yet — nothing has been purchased.
                provider: "none" as const,
                providerPlanId: null,
                metadata: { tier: tier.name.toLowerCase() },
            };

            const [existing] = await db.select({ id: plans.id }).from(plans).where(
                and(eq(plans.name, tier.name), eq(plans.currency, "INR"), eq(plans.interval, "month")),
            ).limit(1);
            if (existing) {
                await db
                    .update(plans)
                    .set(values)
                    .where(eq(plans.id, existing.id));
                console.log(`  ~ updated "${tier.name}"`);
            } else {
                await db.insert(plans).values(values);
                console.log(`  + created "${tier.name}"`);
            }
        }

        // Sanity check the ordering the webhook depends on: the cheapest
        // active plan is what a new user is granted.
        const cheapest = await db
            .select({ name: plans.name })
            .from(plans)
            .where(eq(plans.isActive, true))
            .orderBy(asc(plans.price))
            .limit(1);
        console.log(
            `✅ Plans ready. New users start on: ${cheapest[0]?.name ?? "none"}`,
        );
    } catch (error) {
        console.error("❌ Error seeding plans:", error);
        throw error;
    }
};

// Import the arrays from your categories file
// Adjust the path to where your categories.ts file is actually located

export const seedDynamicCategories = async () => {
    try {
        console.log("Starting dynamic category seed to Neon DB...");

        // Combine all category groups into one array for easier processing
        const allCategoryGroups = [
            ...expenseCategories,
            ...incomeCategories,
            ...subscriptionsCategories,
        ];

        await db.transaction(async (tx) => {
            console.log("Transaction started...");

            for (const group of allCategoryGroups) {
                const parentName = group.label;
                console.log(`Processing parent category: ${parentName}`);

                // 1. Upsert the Parent Category
                await tx
                    .insert(categories)
                    .values({
                        name: parentName,
                        icon: "📁", // Default icon (since categories.ts doesn't have them)
                        color: "#6366f1", // Default color
                        userId: null, // Global category
                        parentName: null,
                    })
                    .onConflictDoUpdate({
                        target: categories.name,
                        set: {
                            name: sql`excluded.name`,
                            // Not overwriting icon/color here so manual DB edits aren't wiped out
                        },
                    });

                // 2. Prepare Child Categories
                const childValues = group.items.map((item) => ({
                    name: item.label, // Using the human-readable label
                    icon: "📄", // Default child icon
                    color: "#9ca3af", // Default child color
                    userId: null,
                    parentName: parentName,
                }));

                // 3. Upsert Child Categories
                if (childValues.length > 0) {
                    await tx
                        .insert(categories)
                        .values(childValues)
                        .onConflictDoUpdate({
                            target: categories.name,
                            set: {
                                parentName: sql`excluded.parent_name`,
                                // Not overwriting icon/color automatically
                            },
                        });
                    console.log(
                        `  -> Inserted/Updated ${childValues.length} items for ${parentName}`,
                    );
                }
            }
        });

        console.log(
            "✅ Transaction completed! Categories successfully seeded to Neon DB.",
        );
    } catch (error) {
        console.error("❌ Error during category update:", error);
        throw error;
    }
};

const main = async () => {
    await seedDynamicCategories();
    // Plans have to land too: every feature gate reads them, and the Clerk
    // webhook grants new users the cheapest active one.
    await seedPlans();
};

main()
    .catch((error: unknown) => {
        console.error("❌ Seed failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await closeDb();
        } catch (error) {
            console.error("❌ Failed to close database connection:", error);
            process.exitCode = 1;
        }
    });
