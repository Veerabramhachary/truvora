import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { categories } from "@/db/schema/schema";
import { canUseFeature } from "@/lib/feature-access";
import {
    expenseCategories,
    subscriptionsCategories,
} from "@/lib/categories";
import { asc, and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const categoryTypeSchema = z.enum(["expense", "subscription"]);
const createCategorySchema = z
    .object({
        name: z.string().trim().min(1).max(40),
        type: categoryTypeSchema,
    })
    .strict();

const builtInCategoryNames = {
    expense: new Set(
        expenseCategories.flatMap((group) =>
            group.items.map((item) => item.label.toLocaleLowerCase()),
        ),
    ),
    subscription: new Set(
        subscriptionsCategories.flatMap((group) =>
            group.items.map((item) => item.label.toLocaleLowerCase()),
        ),
    ),
};

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = categoryTypeSchema.safeParse(req.nextUrl.searchParams.get("type"));
    if (!type.success) {
        return NextResponse.json({ error: "Invalid category type" }, { status: 400 });
    }

    try {
        if (!(await canUseFeature(userId, "customCategories"))) {
            return NextResponse.json(
                { error: "Custom categories are not available on your plan" },
                { status: 403 },
            );
        }

        const data = await db
            .select({ id: categories.id, name: categories.displayName })
            .from(categories)
            .where(
                and(
                    eq(categories.userId, userId),
                    eq(categories.categoryType, type.data),
                ),
            )
            .orderBy(asc(categories.displayName));

        return NextResponse.json(data);
    } catch (error) {
        console.error("Failed to fetch custom categories:", error);
        return NextResponse.json(
            { error: "Could not load categories" },
            { status: 500 },
        );
    }
}

export async function POST(req: Request) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid category" },
            { status: 400 },
        );
    }

    let allowed: boolean;
    try {
        allowed = await canUseFeature(userId, "customCategories");
    } catch (error) {
        console.error("Failed to check custom category access:", error);
        return NextResponse.json(
            { error: "Could not verify category access" },
            { status: 500 },
        );
    }
    if (!allowed) {
        return NextResponse.json(
            { error: "Upgrade your plan to create custom categories" },
            { status: 403 },
        );
    }

    const { name, type } = parsed.data;
    if (builtInCategoryNames[type].has(name.toLocaleLowerCase())) {
        return NextResponse.json(
            { error: "That category already exists" },
            { status: 409 },
        );
    }

    let category: { id: string; name: string | null } | undefined;
    try {
        [category] = await db
            .insert(categories)
            .values({
                name: `custom-${crypto.randomUUID()}`,
                displayName: name,
                userId,
                categoryType: type,
            })
            .onConflictDoNothing()
            .returning({ id: categories.id, name: categories.displayName });
    } catch (error) {
        console.error("Failed to create custom category:", error);
        return NextResponse.json(
            { error: "Could not create category" },
            { status: 500 },
        );
    }

    if (!category) {
        return NextResponse.json(
            { error: "That category already exists" },
            { status: 409 },
        );
    }
    if (!category.name) {
        console.error("Custom category was created without a display name");
        return NextResponse.json(
            { error: "Could not create category" },
            { status: 500 },
        );
    }

    return NextResponse.json(category, { status: 201 });
}
