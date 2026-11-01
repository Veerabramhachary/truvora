import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema/schema";

export type CustomCategoryType = "expense" | "subscription";

/**
 * Custom categories belong to a ledger; built-in ones (no owner) are global.
 */
export async function resolveCategory(
    ledgerId: string,
    name: string,
    type: CustomCategoryType | null,
) {
    if (type) {
        const [customCategory] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(
                and(
                    eq(categories.displayName, name),
                    eq(categories.ledgerId, ledgerId),
                    eq(categories.categoryType, type),
                ),
            )
            .limit(1);
        if (customCategory) return { ...customCategory, isCustom: true };
    }

    const [builtInCategory] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
            and(eq(categories.name, name), isNull(categories.userId)),
        )
        .limit(1);

    return builtInCategory ? { ...builtInCategory, isCustom: false } : null;
}
