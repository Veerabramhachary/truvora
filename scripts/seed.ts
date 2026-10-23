import { db } from "@/db";
import { categories } from "../db/schema/schema";
import { sql } from "drizzle-orm";
import { expenseCategories, incomeCategories, subscriptionsCategories } from "@/lib/categories";

// Import the arrays from your categories file
// Adjust the path to where your categories.ts file is actually located


export const seedDynamicCategories = async () => {
    try {
        console.log("Starting dynamic category seed to Neon DB...");

        // Combine all category groups into one array for easier processing
        const allCategoryGroups = [
            ...expenseCategories,
            ...incomeCategories,
            ...subscriptionsCategories
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
                        icon: "📁",       // Default icon (since categories.ts doesn't have them)
                        color: "#6366f1", // Default color
                        userId: null,     // Global category
                        parentName: null,
                    })
                    .onConflictDoUpdate({
                        target: categories.name, // Requires UNIQUE constraint on 'name'
                        set: { 
                            name: sql`excluded.name`
                            // Not overwriting icon/color here so manual DB edits aren't wiped out
                        },
                    });

                // 2. Prepare Child Categories
                const childValues = group.items.map((item) => ({
                    name: item.label,     // Using the human-readable label
                    icon: "📄",           // Default child icon
                    color: "#9ca3af",     // Default child color
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
                    console.log(`  -> Inserted/Updated ${childValues.length} items for ${parentName}`);
                }
            }
        });

        console.log("✅ Transaction completed! Categories successfully seeded to Neon DB.");
    } catch (error) {
        console.error("❌ Error during category update:", error);
    }
};

seedDynamicCategories().catch(console.error);