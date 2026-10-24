import { db } from "@/db";
import { categories } from "../db/schema/schema";
import { plans } from "../db/schema/plans";
import { asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
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

  `plans.id` is `defaultRandom()` with no unique constraint on `name`, so
  upserting by name isn't available; match-then-write instead. Run this after
  `db:push` and re-running it is safe.
*/
const PLAN_TIERS = [
    {
        name: "Free",
        description: "Getting a handle on your spending.",
        price: "0.00",
        featureLimits: {
            exports: { limit: 5, interval: "month" as const },
            subscriptions: { limit: 5 },
            charts: "basic" as const,
        },
        features: [
            "5 tracked subscriptions",
            "Basic spending chart",
            "5 CSV exports a month",
        ],
    },
    {
        name: "Starter",
        description: "For households with a few recurring charges.",
        price: "4.99",
        featureLimits: {
            exports: { limit: 50, interval: "month" as const },
            subscriptions: { limit: 25 },
            charts: "comparative" as const,
        },
        features: [
            "25 tracked subscriptions",
            "Expenses vs subscriptions breakdown",
            "50 CSV exports a month",
        ],
    },
    {
        name: "Pro",
        description: "Everything, with no ceiling.",
        price: "9.99",
        featureLimits: {
            exports: { limit: 10_000, interval: "month" as const },
            subscriptions: { limit: 1_000 },
            charts: "comparative" as const,
        },
        features: [
            "Up to 1,000 tracked subscriptions",
            "Expenses vs subscriptions breakdown",
            "Up to 10,000 CVS exports a month",
        ],
    },
] as const;

export const seedPlans = async () => {
    try {
        console.log("Seeding plans...");

        const existing = await db
            .select({ id: plans.id, name: plans.name })
            .from(plans);

        for (const tier of PLAN_TIERS) {
            if (existing.some((p) => p.name === tier.name)) {
                // Leave manually-tuned prices and limits alone.
                console.log(`  - "${tier.name}" already present, skipping`);
                continue;
            }

            await db.insert(plans).values({
                name: tier.name,
                description: tier.description,
                price: tier.price,
                currency: "INR",
                interval: "month",
                features: [...tier.features],
                featureLimits: tier.featureLimits,
                isActive: true,
                // Not a gateway plan yet — nothing has been purchased.
                provider: "none",
            });
            console.log(`  + created "${tier.name}"`);
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
                        target: categories.name, // Requires UNIQUE constraint on 'name'
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
                    parentName: parentName, // Link to the parent we just created
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
    }
};

seedDynamicCategories().catch(console.error);
// Plans have to land too: every feature gate reads them, and the Clerk
// webhook grants new users the cheapest active one.
seedPlans().catch(console.error);
