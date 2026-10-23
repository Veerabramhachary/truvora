import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionGate } from "@/lib/subscription";
import z from "zod";
import {
    ONGOING_END_DATE,
    nextRenewalDate,
    subscriptionSchema,
} from "./schema";

/**
 * `@refinedev/simple-rest` sends `_start`/`_end`/`_sort`/`_order` and reads the
 * row count out of `X-Total-Count`. Without them Refine believes there are zero
 * rows, so the subscriptions screen broke as soon as it paginated.
 */
const SORTABLE = {
    id: subscriptions.id,
    title: subscriptions.name,
    amount: subscriptions.price,
    date: subscriptions.startDate,
    active: subscriptions.active,
} as const;

export async function GET(req: NextRequest) {
    try {
        // Authenticate user
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const params = req.nextUrl.searchParams;

        // Clamp so a crafted query can't request the whole table at once.
        const requestedStart = Number(params.get("_start") ?? "0");
        const requestedEnd = Number(params.get("_end") ?? "10");
        const start = Number.isFinite(requestedStart)
            ? Math.max(0, Math.trunc(requestedStart))
            : 0;
        const end =
            Number.isFinite(requestedEnd) && requestedEnd > start
                ? Math.min(Math.trunc(requestedEnd), start + 100)
                : start + 10;

        const sortKey = params.get("_sort") ?? "startDate";
        const column =
            SORTABLE[sortKey as keyof typeof SORTABLE] ?? subscriptions.startDate;
        const order =
            (params.get("_order") ?? "desc").toLowerCase() === "asc"
                ? asc
                : desc;

        const forUser = eq(subscriptions.userId, userId);

        const countRow = await db
            .select({ total: sql<number>`count(*)` })
            .from(subscriptions)
            .where(forUser);
        const total = Number(countRow[0]?.total ?? 0);

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
                interval: subscriptions.interval,
                intervalCount: subscriptions.intervalCount,
                endDate: subscriptions.endDate,
                nextDate: subscriptions.nextDate,
            })
            .from(subscriptions)
            .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
            .where(forUser)
            .orderBy(order(column))
            .limit(end - start)
            .offset(start);

        return NextResponse.json(data, {
            status: 200,
            headers: { "X-Total-Count": String(total) },
        });
    } catch (err) {
        console.error("Failed to fetch subscriptions:", err);
        return NextResponse.json(
            { error: "Failed to fetch subscriptions" },
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

    let data: z.infer<typeof subscriptionSchema>;
    try {
        data = subscriptionSchema.parse(body);
    } catch (error) {
        const message =
            error instanceof z.ZodError
                ? error.issues[0]?.message ?? "Invalid subscription data"
                : "Invalid subscription data";
        return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
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
                    endDate: data.endDate ?? ONGOING_END_DATE,
                    nextDate:
                        data.nextDate ??
                        (data.endDate ??
                            nextRenewalDate(
                                data.startDate,
                                data.interval,
                                data.intervalCount,
                            )),
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
    } catch (error) {
        console.error("Subscription creation error:", error);
        if (error instanceof Error && (error.message === "Subscription limit exceeded" || error.message === "Your plan does not allow subscriptions")) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        // Never leak driver internals to the client.
        return NextResponse.json({ error: "Could not save the subscription" }, { status: 500 });
    }
}
