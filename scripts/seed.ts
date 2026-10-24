import { closeDb, db } from "@/db";
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

  `plans.name` has no unique constraint, so match-then-write instead of using
  an upsert. Run this after `db:push`.
*/
const PLAN_TIERS = [
    {
        name: "Free",
        description: "Get a clear picture of your recurring spending.",
        price: "0",
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
        description: "For people who want to stay on top of every bill.",
        price: "99",
        featureLimits: {
            exports: { limit: 25, interval: "month" as const },
            subscriptions: { limit: 25 },
            charts: "comparative" as const,
        },
        features: [
            "25 tracked subscriptions",
            "Expenses vs subscriptions breakdown",
            "20 CSV exports a month",
        ],
    },
    {
        name: "Pro",
        description: "For complete visibility and more room to grow.",
        price: "199",
        featureLimits: {
            exports: { limit: 1000, interval: "month" as const },
            subscriptions: { limit: 100 },
            charts: "comparative" as const,
        },
        features: [
            "Up to 100 tracked subscriptions",
            "Expenses vs subscriptions breakdown",
            "Up to 1,000 CVS exports a month",
        ],
    },
] as const;

export const seedPlans = async () => {
    try {
        console.log("Seeding plans...");

        const existing = await db.select({ name: plans.name }).from(plans);
        const existingNames = new Set(existing.map((plan) => plan.name));

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
                // Not a gateway plan yet — nothing has been purchased.
                provider: "none" as const,
            };

            if (existingNames.has(tier.name)) {
                await db
                    .update(plans)
                    .set(values)
                    .where(eq(plans.name, tier.name));
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