import { db } from "@/db";
import { categories } from "../db/schema/schema";
import { eq, or, sql } from "drizzle-orm";

export const updateCategoriesExtended = async () => {
    try {
        console.log("Starting updateCategoriesExtended function...");

        // Step 1: Delete old categories with parentId (optional)
        await db.transaction(async (tx) => {
            console.log("Starting transaction...");

            // const deleteResult = await tx
            //     .delete(categories)
            //     .where(
            //         or(
            //             eq(categories.parentId, "extra"),
            //             eq(categories.parentId, "subscriptions"),
            //             eq(categories.parentId, "expenses"),
            //             eq(categories.parentId, "financial"),
            //             eq(categories.parentId, "shopping")
            //         )
            //     );
            // console.log(`Deleted categories with parentId. Rows affected: ${deleteResult}`);

            const parentCategories = [
                { name: "shopping", icon: "🛍️", color: "#FF3333" },
                { name: "travel", icon: "✈️", color: "#99FF33" },
                { name: "work", icon: "💼", color: "#33FF66" },
                { name: "subscriptions", icon: "💳", color: "#6366f1" },
                { name: "financial", icon: "💵", color: "#3399FF" },
                { name: "expenses", icon: "💳", color: "#ef4444" },
                { name: "health", icon: "🏋️‍♂️", color: "#1B5E20" },
                { name: "housing", icon: "🏠", color: "#FF9999" },
            ];

            for (const p of parentCategories) {
                console.log(`Inserting or updating parent category: ${p.name}`);

                const [inserted] = await tx
                    .insert(categories)
                    .values({
                        name: p.name,
                        icon: p.icon,
                        color: p.color,
                        userId: null, // Assuming global seed
                        parentName: null,
                    })
                    .onConflictDoUpdate({
                        target: categories.name, // Requires a UNIQUE constraint on 'name'
                        set: { icon: p.icon, color: p.color },
                    })
                    .returning({ id: categories.id, name: categories.name });
            }

            // Step 2: Insert new extended categories
            console.log("Inserting new extended categories...");
            const newCategories = [
                {
                    name: "Clothing & Accessories",
                    icon: "👗",
                    color: "#FF6666",
                    parentName: "shopping",
                },
                {
                    name: "Electronics & Gadgets",
                    icon: "📱",
                    color: "#FF9900",
                    parentName: "shopping",
                },
                {
                    name: "Groceries & Food",
                    icon: "🛒",
                    color: "#FFCC33",
                    parentName: "shopping",
                },
                {
                    name: "Home Decor",
                    icon: "🛋️",
                    color: "#FF9999",
                    parentName: "shopping",
                },
                {
                    name: "Personal Care & Cosmetics",
                    icon: "💄",
                    color: "#FF66CC",
                    parentName: "shopping",
                },
                {
                    name: "Gifts & Special Occasions",
                    icon: "🎁",
                    color: "#FF3399",
                    parentName: "shopping",
                },
                {
                    name: "Books & Stationery",
                    icon: "📚",
                    color: "#9966FF",
                    parentName: "shopping",
                },
                {
                    name: "Online Shopping",
                    icon: "🛍️",
                    color: "#FF6666",
                    parentName: "shopping",
                },
                {
                    name: "Pet Supplies",
                    icon: "🐾",
                    color: "#66CC66",
                    parentName: "shopping",
                },
                {
                    name: "Hobby & Leisure",
                    icon: "🎨",
                    color: "#FFCC66",
                    parentName: "shopping",
                },

                {
                    name: "Flights",
                    icon: "✈️",
                    color: "#66CCFF",
                    parentName: "travel",
                },
                {
                    name: "Hotels & Accommodation",
                    icon: "🏨",
                    color: "#FFCC99",
                    parentName: "travel",
                },
                {
                    name: "Local Transport",
                    icon: "🚕",
                    color: "#FF9933",
                    parentName: "travel",
                },
                {
                    name: "Fuel & Gas",
                    icon: "⛽",
                    color: "#FF6600",
                    parentName: "travel",
                },
                {
                    name: "Travel Insurance",
                    icon: "🛡️",
                    color: "#3399FF",
                    parentName: "travel",
                },
                {
                    name: "Tour Packages",
                    icon: "🗺️",
                    color: "#66FF99",
                    parentName: "travel",
                },
                {
                    name: "Dining & Entertainment Abroad",
                    icon: "🍽️",
                    color: "#FF6666",
                    parentName: "travel",
                },
                {
                    name: "Souvenirs & Shopping",
                    icon: "🛍️",
                    color: "#FFCC33",
                    parentName: "travel",
                },
                {
                    name: "Visa & Passport Fees",
                    icon: "🛂",
                    color: "#9966FF",
                    parentName: "travel",
                },
                {
                    name: "Car Rentals",
                    icon: "🚗",
                    color: "#FF9933",
                    parentName: "travel",
                },

                {
                    name: "Office Supplies",
                    icon: "✏️",
                    color: "#FFCC66",
                    parentName: "work",
                },
                {
                    name: "Equipment & Tools",
                    icon: "🛠️",
                    color: "#FF9966",
                    parentName: "work",
                },
                {
                    name: "Client Entertainment",
                    icon: "🍷",
                    color: "#FF6666",
                    parentName: "work",
                },
                {
                    name: "Business Travel",
                    icon: "💼",
                    color: "#3399FF",
                    parentName: "work",
                },
                {
                    name: "Courses & Training",
                    icon: "📖",
                    color: "#66CCFF",
                    parentName: "work",
                },
                {
                    name: "Co-working Space",
                    icon: "🏢",
                    color: "#FFCC99",
                    parentName: "work",
                },
                {
                    name: "Conferences & Seminars",
                    icon: "🎤",
                    color: "#FF9966",
                    parentName: "work",
                },
                {
                    name: "Software & Subscriptions",
                    icon: "💻",
                    color: "#9933FF",
                    parentName: "work",
                },
                {
                    name: "Team Lunches / Meetings",
                    icon: "🍽️",
                    color: "#FF6666",
                    parentName: "work",
                },
                {
                    name: "Professional Services",
                    icon: "🧾",
                    color: "#66CC66",
                    parentName: "work",
                },

                {
                    name: "Streaming Services",
                    icon: "🎬",
                    color: "#FF3333",
                    parentName: "subscriptions",
                },
                {
                    name: "Software Subscriptions",
                    icon: "💻",
                    color: "#3399FF",
                    parentName: "subscriptions",
                },
                {
                    name: "Magazines & Newspapers",
                    icon: "📰",
                    color: "#FFCC66",
                    parentName: "subscriptions",
                },
                {
                    name: "Cloud Storage",
                    icon: "☁️",
                    color: "#66CCFF",
                    parentName: "subscriptions",
                },
                {
                    name: "Mobile Apps",
                    icon: "📱",
                    color: "#FF9933",
                    parentName: "subscriptions",
                },
                {
                    name: "Online Learning Platforms",
                    icon: "🎓",
                    color: "#9966FF",
                    parentName: "subscriptions",
                },
                {
                    name: "Meal Kits / Food Delivery",
                    icon: "🥡",
                    color: "#FFCC33",
                    parentName: "subscriptions",
                },
                {
                    name: "Gaming Subscriptions",
                    icon: "🎮",
                    color: "#FF6699",
                    parentName: "subscriptions",
                },
                {
                    name: "Health & Wellness Apps",
                    icon: "🧘‍♂️",
                    color: "#66FF99",
                    parentName: "subscriptions",
                },

                {
                    name: "Savings & Investments",
                    icon: "💰",
                    color: "#3399FF",
                    parentName: "financial",
                },
                {
                    name: "Loan Repayments",
                    icon: "🏦",
                    color: "#FF6666",
                    parentName: "financial",
                },
                {
                    name: "Credit Card Payments",
                    icon: "💳",
                    color: "#FF3333",
                    parentName: "financial",
                },
                {
                    name: "Insurance Premiums",
                    icon: "🛡️",
                    color: "#FFCC33",
                    parentName: "financial",
                },
                {
                    name: "Taxes",
                    icon: "📑",
                    color: "#9966FF",
                    parentName: "financial",
                },
                {
                    name: "Emergency Fund Contributions",
                    icon: "🚨",
                    color: "#FF9900",
                    parentName: "financial",
                },
                {
                    name: "Retirement Fund",
                    icon: "👴",
                    color: "#66CC66",
                    parentName: "financial",
                },
                {
                    name: "Donations / Charity",
                    icon: "🙏",
                    color: "#FF9999",
                    parentName: "financial",
                },
                {
                    name: "Stock Market Investments",
                    icon: "📈",
                    color: "#33FF66",
                    parentName: "financial",
                },
                {
                    name: "Bank Fees",
                    icon: "🏦",
                    color: "#FFCC99",
                    parentName: "financial",
                },
                {
                    name: "Transportation",
                    icon: "🚌",
                    color: "#FF9933",
                    parentName: "expenses",
                },
                {
                    name: "Food & Dining",
                    icon: "🍴",
                    color: "#FF6666",
                    parentName: "expenses",
                },
                {
                    name: "Education / Tuition",
                    icon: "🎓",
                    color: "#9966FF",
                    parentName: "expenses",
                },
                {
                    name: "Medical / Healthcare",
                    icon: "🏥",
                    color: "#33FF66",
                    parentName: "expenses",
                },
                {
                    name: "Entertainment & Leisure",
                    icon: "🎮",
                    color: "#FF3399",
                    parentName: "expenses",
                },
                {
                    name: "Household Items",
                    icon: "🧹",
                    color: "#FFCC99",
                    parentName: "expenses",
                },
                {
                    name: "Clothing",
                    icon: "👕",
                    color: "#FF6666",
                    parentName: "expenses",
                },
                {
                    name: "Miscellaneous",
                    icon: "🔧",
                    color: "#999999",
                    parentName: "expenses",
                },

                {
                    name: "Gym Membership",
                    icon: "🏋️‍♂️",
                    color: "#1B5E20",
                    parentName: "health",
                },
                {
                    name: "Supplements & Vitamins",
                    icon: "💊",
                    color: "#FFCC33",
                    parentName: "health",
                },
                {
                    name: "Doctor Visits",
                    icon: "🩺",
                    color: "#3399FF",
                    parentName: "health",
                },
                {
                    name: "Medicines & Prescriptions",
                    icon: "💊",
                    color: "#FF6666",
                    parentName: "health",
                },
                {
                    name: "Fitness Equipment",
                    icon: "🏋️",
                    color: "#33FF66",
                    parentName: "health",
                },
                {
                    name: "Therapy / Counseling",
                    icon: "🛋️",
                    color: "#9966FF",
                    parentName: "health",
                },
                {
                    name: "Health Insurance",
                    icon: "🛡️",
                    color: "#FF9933",
                    parentName: "health",
                },
                {
                    name: "Sports & Activities",
                    icon: "⚽",
                    color: "#FFCC66",
                    parentName: "health",
                },
                {
                    name: "Nutrition & Diet Plans",
                    icon: "🥗",
                    color: "#66FF99",
                    parentName: "health",
                },
                {
                    name: "Preventive Checkups",
                    icon: "🩺",
                    color: "#FF6666",
                    parentName: "health",
                },

                {
                    name: "Rent / Mortgage",
                    icon: "🏠",
                    color: "#FF9999",
                    parentName: "housing",
                },
                {
                    name: "Utilities",
                    icon: "💡",
                    color: "#FFCC33",
                    parentName: "housing",
                },
                {
                    name: "Maintenance & Repairs",
                    icon: "🔧",
                    color: "#FF9966",
                    parentName: "housing",
                },
                {
                    name: "Home Improvement",
                    icon: "🛠️",
                    color: "#FFCC66",
                    parentName: "housing",
                },
                {
                    name: "Property Taxes",
                    icon: "📑",
                    color: "#9966FF",
                    parentName: "housing",
                },
                {
                    name: "Furniture & Appliances",
                    icon: "🛋️",
                    color: "#FF9999",
                    parentName: "housing",
                },
                {
                    name: "Internet & Cable",
                    icon: "📶",
                    color: "#66CCFF",
                    parentName: "housing",
                },
                {
                    name: "Security Systems",
                    icon: "🔒",
                    color: "#FF3333",
                    parentName: "housing",
                },
                {
                    name: "Cleaning & Housekeeping",
                    icon: "🧹",
                    color: "#FFCC99",
                    parentName: "housing",
                },
                {
                    name: "Gardening",
                    icon: "🌿",
                    color: "#33FF66",
                    parentName: "housing",
                },
            ];

            const childValues = newCategories.map((child) => {
                return {
                    name: child.name,
                    icon: child.icon,
                    color: child.color,
                    userId: null,
                    parentName: child.parentName ?? null,
                };
            });

            // Insert the new categories into the database
            if (childValues.length > 0) {
                const insertResult = await tx
                    .insert(categories)
                    .values(childValues)
                    .onConflictDoUpdate({
                        target: categories.name,
                        set: {
                            icon: sql`excluded.icon`,
                            color: sql`excluded.color`,
                            parentName: sql`excluded.parent_name`,
                        },
                    });
                console.log(
                    "Inserted new categories successfully. Rows affected:",
                    insertResult,
                );
            } else {
                console.log("No new categories to insert.");
            }
        });

        console.log("Transaction completed successfully.");
    } catch (error) {
        console.error("Error during category update:", error);
    }
};

updateCategoriesExtended().catch(console.error);
