import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionGate } from "@/lib/subscription";
import z from "zod";
import {
    nextRenewalDate,
    subscriptionEndDate,
    subscriptionSchema,
} from "./schema";
import { resolveCategory } from "@/lib/category-access";
import { canUseFeature } from "@/lib/feature-access";
import { ledgerErrorResponse, requireLedger } from "@/lib/ledger";
import {
    activeSubscriptionFlag,
    countActiveSubscriptions,
    syncActiveSubscriptionUsage,
} from "@/lib/active-subscription";

/**
 * `@refinedev/simple-rest` sends `_start`/`_end`/`_sort`/`_order` and reads the
 * row count out of `X-Total-Count`. Without them Refine believes there are zero
 * rows, so the subscriptions screen broke as soon as it paginated.
 */
const SORTABLE = {
    id: subscriptions.id,
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
        const ledger = await requireLedger(req, userId);

        const params = req.nextUrl.searchParams;

        // Expired records should stop counting as active even when the user
        // has not opened the subscription screen since its end date passed.
        const now = new Date();
        await db
            .update(subscriptions)
            .set({
                active: false,
                deactivatedAt: sql`COALESCE(${subscriptions.deactivatedAt}, ${subscriptions.endDate})`,
                updatedAt: now,
            })
            .where(sql`${subscriptions.userId} = ${userId}
                AND ${subscriptions.active} = TRUE
                AND ${subscriptions.endDate} < ${now}`);

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

        const forLedger = eq(subscriptions.ledgerId, ledger.id);

        const countRow = await db
            .select({ total: sql<number>`count(*)` })
            .from(subscriptions)
            .where(forLedger);
        const total = Number(countRow[0]?.total ?? 0);

        const data = await db
            .select({
                id: subscriptions.id,
                title: subscriptions.name,
                active: activeSubscriptionFlag(now),
                amount: subscriptions.price,
                date: subscriptions.startDate,
                description: subscriptions.note,
                categoryId: subscriptions.categoryId,
                categoryName: sql`COALESCE(${categories.displayName}, ${categories.name})`,
                currency: subscriptions.currency,
                interval: subscriptions.interval,
                intervalCount: subscriptions.intervalCount,
                endDate: subscriptions.endDate,
                nextDate: subscriptions.nextDate,
            })
            .from(subscriptions)
            .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
            .where(forLedger)
            .orderBy(order(column))
            .limit(end - start)
            .offset(start);

        return NextResponse.json(data, {
            status: 200,
            headers: { "X-Total-Count": String(total) },
        });
    } catch (err) {
        const ledgerResponse = ledgerErrorResponse(err);
        if (ledgerResponse) return ledgerResponse;
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
        if (data.currency !== "INR") {
            return NextResponse.json({ error: "New financial records must use INR" }, { status: 400 });
        }
        const ledger = await requireLedger(req, userId);
        const category = await resolveCategory(
            ledger.id,
            data.category,
            "subscription",
        );
        if (!category) {
            return NextResponse.json(
                { error: "Category not found" },
                { status: 404 },
            );
        }
        if (category.isCustom && !(await canUseFeature(userId, "customCategories"))) {
            return NextResponse.json(
                { error: "Upgrade your plan to use custom categories" },
                { status: 403 },
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

        // Everything below runs under one per-user advisory lock, so two
        // concurrent requests cannot both pass the plan-limit check.
        const result = await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
            const now = new Date();

            // Throws when one more active subscription would exceed the plan.
            const assertRoomForOneMore = async () => {
                if (unlimited) return;
                const current = await countActiveSubscriptions(tx, userId, now);
                if (current + 1 > maxSubscriptions) {
                    throw new Error("Subscription limit exceeded");
                }
            };

            // Names are encrypted at rest, so find a same-name card after
            // selecting this ledger's rows (the database cannot compare them).
            // Prefer an active card, then the most recently edited matching one.
            const existingRows = await tx
                .select({
                    id: subscriptions.id,
                    name: subscriptions.name,
                    isActive: activeSubscriptionFlag(now),
                    updatedAt: subscriptions.updatedAt,
                })
                .from(subscriptions)
                .where(eq(subscriptions.ledgerId, ledger.id));
            const normalizedName = data.name.trim().toLocaleLowerCase();
            const existing = existingRows
                .filter((row) => row.name?.trim().toLocaleLowerCase() === normalizedName)
                .sort((a, b) => Number(b.isActive) - Number(a.isActive) || (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0];

            // Re-adding a known service revives/edits its card instead of
            // creating a second card. Record the new charge as transaction history.
            if (existing) {
                const today = now;
                const endDate = subscriptionEndDate(data.endDate);
                const willBeActive = endDate >= today;
                // Reviving an inactive card makes it count against the plan
                // again, so it needs the same limit check as a new card.
                if (willBeActive && !existing.isActive) {
                    await assertRoomForOneMore();
                }
                const [updated] = await tx.update(subscriptions).set({
                    name: data.name,
                    price: data.price,
                    currency: data.currency,
                    interval: data.interval,
                    intervalCount: data.intervalCount || 1,
                    startDate: today,
                    endDate,
                    nextDate: nextRenewalDate(today, data.interval, data.intervalCount),
                    categoryId: category.id,
                    note: data.note || null,
                    active: willBeActive,
                    deactivatedAt: willBeActive ? null : endDate,
                    updatedAt: today,
                }).where(eq(subscriptions.id, existing.id)).returning({ id: subscriptions.id });

                await tx.insert(transactions).values({
                    title: data.name,
                    description: data.note,
                    amount: data.price,
                    date: today,
                    type: "subscription",
                    userId,
                    ledgerId: ledger.id,
                    categoryId: category.id,
                    subscriptionId: existing.id,
                    action: "created",
                    currency: data.currency,
                    createdAt: today,
                });
                await syncActiveSubscriptionUsage(tx, userId, today);
                return { ...updated, reused: true };
            }

            await assertRoomForOneMore();

            // Insert the new subscription
            const [created] = await tx
                .insert(subscriptions)
                .values({
                    userId,
                    ledgerId: ledger.id,
                    name: data.name,
                    price: data.price,
                    currency: data.currency,
                    interval: data.interval,
                    intervalCount: data.intervalCount || 1,
                    startDate: data.startDate,
                    endDate: subscriptionEndDate(data.endDate),
                    nextDate:
                        data.nextDate ??
                        nextRenewalDate(
                            data.startDate,
                            data.interval,
                            data.intervalCount,
                        ),
                    categoryId: category.id,
                    note: data.note || null,
                    // Keep future-dated subscriptions eligible to become
                    // active automatically when their start date arrives.
                    active: subscriptionEndDate(data.endDate) >= now,
                    deactivatedAt:
                        subscriptionEndDate(data.endDate) < now
                            ? subscriptionEndDate(data.endDate)
                            : null,
                })
                .returning({ id: subscriptions.id });

            await syncActiveSubscriptionUsage(tx, userId, now);

            // Link the first charge to its subscription (F-04). Without
            // `subscriptionId` this row was orphaned: deleting the subscription
            // left it behind and renewal de-duplication could not see it.
            await tx.insert(transactions).values({
                title: data.name,
                description: data.note,
                amount: data.price,
                date: data.startDate,
                type: "subscription",
                userId,
                ledgerId: ledger.id,
                categoryId: category.id,
                subscriptionId: created.id,
                action: "created",
                currency: data.currency,
                createdAt: now,
            });
            return { ...created, reused: false };
        });

        return NextResponse.json(result, { status: result.reused ? 200 : 201 });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Subscription creation error:", error);
        if (error instanceof Error && (error.message === "Subscription limit exceeded" || error.message === "Your plan does not allow subscriptions")) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        // Never leak driver internals to the client.
        return NextResponse.json({ error: "Could not save the subscription" }, { status: 500 });
    }
}
