import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { subscriptions, transactions } from "@/db/schema/schema";
import { featureUsage } from "@/db/schema/feature-usage";
import {
    nextRenewalDate,
    subscriptionEndDate,
    subscriptionSchema,
} from "../schema";
import { resolveCategory } from "@/lib/category-access";
import { canUseFeature } from "@/lib/feature-access";

type Params = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();
const statusSchema = z.object({ active: z.boolean() }).strict();

export async function PATCH(req: Request, { params }: Params) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = (await params).id;
        if (!idSchema.safeParse(id).success) {
            return NextResponse.json(
                { error: "Invalid subscription id" },
                { status: 400 },
            );
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 },
            );
        }

        const statusUpdate = statusSchema.safeParse(body);
        if (statusUpdate.success) {
            const [existing] = await db
                .select({
                    startDate: subscriptions.startDate,
                    endDate: subscriptions.endDate,
                })
                .from(subscriptions)
                .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
                .limit(1);
            if (!existing) {
                return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
            }

            const now = new Date();
            if (statusUpdate.data.active && existing.endDate < now) {
                return NextResponse.json(
                    { error: "A subscription can only be activated between its start and end dates" },
                    { status: 400 },
                );
            }

            await db.update(subscriptions).set({
                active: statusUpdate.data.active,
                deactivatedAt: statusUpdate.data.active ? null : now,
                updatedAt: now,
            }).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
            await syncActiveSubscriptionUsage(userId);
            return NextResponse.json({ success: true, data: { id, active: statusUpdate.data.active } });
        }

        const data = subscriptionSchema.parse(body);

        const [existingSubscription] = await db.select({
            currency: subscriptions.currency,
            active: subscriptions.active,
            deactivatedAt: subscriptions.deactivatedAt,
        })
            .from(subscriptions)
            .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
            .limit(1);
        if (!existingSubscription) {
            return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
        }
        if (data.currency !== existingSubscription.currency) {
            return NextResponse.json({ error: "Currency cannot be changed for an existing record" }, { status: 400 });
        }

        const category = await resolveCategory(
            userId,
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

        const now = new Date();
        const endDate = subscriptionEndDate(data.endDate);
        const expired = endDate < now;
        const shouldBeActive = data.active ?? existingSubscription.active;
        if (shouldBeActive && expired) {
            return NextResponse.json(
                { error: "An expired subscription cannot be active" },
                { status: 400 },
            );
        }
        const updated = await db
            .update(subscriptions)
            .set({
                name: data.name,
                price: data.price,
                currency: data.currency,
                interval: data.interval,
                intervalCount: data.intervalCount ?? 1,
                startDate: data.startDate,
                endDate,
                nextDate:
                    data.nextDate ??
                    nextRenewalDate(
                        data.startDate,
                        data.interval,
                        data.intervalCount,
                    ),
                categoryId: category.id,
                note: data.note || null,
                active: expired ? false : shouldBeActive,
                deactivatedAt: expired
                    ? endDate
                    : shouldBeActive
                      ? null
                      : existingSubscription.deactivatedAt ?? now,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(subscriptions.id, id),
                    eq(subscriptions.userId, userId),
                ),
            )
            .returning({ id: subscriptions.id });

        if (updated.length === 0) {
            return NextResponse.json(
                { error: "Subscription not found" },
                { status: 404 },
            );
        }

        await syncActiveSubscriptionUsage(userId);

        return NextResponse.json({ success: true, data: updated[0] });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    error:
                        error.issues[0]?.message ?? "Invalid subscription data",
                },
                { status: 400 },
            );
        }
        console.error("Subscription update failed:", error);
        return NextResponse.json(
            { error: "Could not save the subscription" },
            { status: 500 },
        );
    }
}

export async function DELETE(_req: Request, { params }: Params) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = (await params).id;
        if (!idSchema.safeParse(id).success) {
            return NextResponse.json(
                { error: "Invalid subscription id" },
                { status: 400 },
            );
        }

        // `transactions.subscription_id` references subscriptions, so remove
        // ledger entries first. Keep both deletes atomic to avoid losing the
        // ledger if deleting the parent row fails.
        const { ledgerRows, deleted } = await db.transaction(async (tx) => {
            const removedLedgerRows = await tx
                .delete(transactions)
                .where(
                    and(
                        eq(transactions.subscriptionId, id),
                        eq(transactions.userId, userId),
                    ),
                )
                .returning({ id: transactions.id });

            const removedSubscriptions = await tx
                .delete(subscriptions)
                .where(
                    and(
                        eq(subscriptions.id, id),
                        eq(subscriptions.userId, userId),
                    ),
                )
                .returning({ id: subscriptions.id });

            return { ledgerRows: removedLedgerRows, deleted: removedSubscriptions };
        });

        if (deleted.length === 0) {
            return NextResponse.json(
                { error: "Subscription not found" },
                { status: 404 },
            );
        }

        await syncActiveSubscriptionUsage(userId);

        return NextResponse.json({
            success: true,
            data: { ...deleted[0], ledgerRowsRemoved: ledgerRows.length },
        });
    } catch (error) {
        console.error("Subscription delete failed:", error);
        return NextResponse.json(
            { error: "Could not delete the subscription" },
            { status: 500 },
        );
    }
}

async function syncActiveSubscriptionUsage(userId: string) {
    const [active] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(sql`${subscriptions.userId} = ${userId}
            AND ${subscriptions.active} = TRUE
            AND ${subscriptions.startDate} <= NOW()
            AND ${subscriptions.endDate} >= NOW()
            AND ${subscriptions.deactivatedAt} IS NULL`);

    await db.insert(featureUsage).values({
        userId,
        feature: "subscriptions",
        period: "active",
        count: active?.count ?? 0,
    }).onConflictDoUpdate({
        target: [featureUsage.userId, featureUsage.feature, featureUsage.period],
        set: { count: active?.count ?? 0, updatedAt: new Date() },
    });
}
