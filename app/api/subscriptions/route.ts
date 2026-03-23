import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { desc, eq, sql } from "drizzle-orm";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import { NextResponse } from "next/server";
import { getSubscriptionGate } from "@/lib/subscription";
import z from "zod";

export async function GET() {
    try {
        // Authenticate user
        const { userId } = await auth();
        if (!userId) {
            console.error("User not authenticated");
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        // Fetch expenses for the authenticated user
        const data = await db
            .select({
                subscriptionId: subscriptions.id,
                title: subscriptions.name,
                active: subscriptions.active,
                amount: subscriptions.price,
                date: subscriptions.startDate,
                description: subscriptions.note,
                categoryId: subscriptions.categoryId,
                categoryName: categories.name,
                currency: subscriptions.currency,
                endDate: subscriptions.endDate,
            })
            .from(subscriptions)
            .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
            .where(eq(subscriptions.userId, userId))
            .orderBy(desc(subscriptions.startDate));

    

        return NextResponse.json(data, { status: 200 });
    } catch (err) {
        console.error("Failed to fetch subscriptions:", err);
        return new Response(
            JSON.stringify({ error: "Failed to fetch subscriptions" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }
}
const subscriptionSchema = z.object({
    name: z.string().min(1),
    price: z.coerce.string(),
    currency: z.string().min(1),
    interval: z.enum(["month", "year"]),
    intervalCount: z.number().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    nextDate: z.coerce.date(),
    category: z.string().min(1),
    note: z.string().optional(),
    active: z.boolean().optional(),
    deactivatedAt: z.date().optional(),
})

export async function POST(req: Request) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const data = subscriptionSchema.parse(body);

    const categoryResult = await db
        .select({id: categories.id})
        .from(categories)
        .where(eq(categories.name, data.category))

    const category = categoryResult[0]?.id;
    if (!category) {
        return NextResponse.json(
            { error: "Category not found" },
            { status: 404 },
        );
    }

    // --- Fetch user's active subscription gate ---
    const gate = await getSubscriptionGate();
    if (!gate) {
        return NextResponse.json(
            { error: "No active subscription plan found" },
            { status: 403 },
        );
    }

    // --- Get the subscription limit from the plan's feature limits ---
    const featureLimit = gate.checkFeatures("subscriptions");
    let maxSubscriptions = 0;

    if (
        featureLimit &&
        typeof featureLimit === "object" &&
        "limit" in featureLimit
    ) {
        maxSubscriptions = featureLimit.limit;
    } else if (typeof featureLimit === "number") {
        maxSubscriptions = featureLimit;
    } else {
        // If the feature is not defined in the plan, deny creation
        return NextResponse.json(
            { error: "Your plan does not allow subscriptions" },
            { status: 403 },
        );
    }

    // If the plan allows unlimited subscriptions (limit === -1), skip further checks
    const unlimited = maxSubscriptions === -1;

    try {
        // Transaction: lock active subscriptions and insert new one if under limit
        const result = await db.transaction(async (tx) => {
            if (!unlimited) {
                // Lock the user's active subscriptions to prevent race conditions
                const locked = await tx.execute(sql`
                    SELECT id FROM ${subscriptions}
                    WHERE ${subscriptions.userId} = ${userId}
                    AND ${subscriptions.startDate} <= NOW()
                    AND ${subscriptions.endDate} >= NOW()
                    AND ${subscriptions.deactivatedAt} IS NULL
                    FOR UPDATE
                `);
                const currentCount = locked.rows.length;

                if (currentCount + 1 > maxSubscriptions) {
                    throw new Error("Subscription limit exceeded");
                }
            }

            // Insert the new subscription
            await tx
                .insert(subscriptions)
                .values({
                    userId,
                    name: data.name,
                    price: data.price,
                    currency: data.currency,
                    interval: data.interval,
                    intervalCount: data.intervalCount || 1,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    nextDate: data.endDate,
                    categoryId: category,
                    note: data.note || null,
                    active: true,
                    deactivatedAt: null,
                })

                await tx.insert(transactions).values({
                    title: data.name,
                    description: data.note,
                    amount: data.price,
                    date: data.startDate,
                    type: "subscription",
                    userId: userId,
                    categoryId: category,
                    action: "created",
                    currency: data.currency,
                    createdAt: new Date(),
                })
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error: any) {
        console.error("Subscription creation error:", error);
        const status =
            error.message === "Subscription limit exceeded" ? 403 : 400;
        return NextResponse.json({ error: error.message }, { status });
    }
}
