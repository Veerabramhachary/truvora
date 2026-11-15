import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { subscriptions, transactions } from "@/db/schema/schema";
import {
    nextRenewalDate,
    subscriptionEndDate,
    subscriptionSchema,
} from "../schema";
import { resolveCategory } from "@/lib/category-access";
import { canUseFeature } from "@/lib/feature-access";
import { ledgerErrorResponse, requireLedger } from "@/lib/ledger";
import { validateTaxKind } from "@/lib/tax";
import { syncActiveSubscriptionUsage } from "@/lib/active-subscription";

type Params = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();
const statusSchema = z.object({ active: z.boolean() }).strict();

export async function PATCH(req: Request, { params }: Params) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const ledger = await requireLedger(req, userId);

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
                .where(and(eq(subscriptions.id, id), eq(subscriptions.ledgerId, ledger.id)))
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
            }).where(and(eq(subscriptions.id, id), eq(subscriptions.ledgerId, ledger.id)));
            await syncActiveSubscriptionUsage(db, userId);
            return NextResponse.json({ success: true, data: { id, active: statusUpdate.data.active } });
        }

        const data = subscriptionSchema.parse(body);

        const taxError = validateTaxKind({
            ledgerType: ledger.type,
            recordType: "subscription",
            taxKind: data.taxKind,
        });
        if (taxError) {
            return NextResponse.json({ error: taxError }, { status: 400 });
        }
        // undefined = leave as is, null = clear, a kind = set.
        const taxPatch = data.taxKind === undefined ? {} : { taxKind: data.taxKind };

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

        const initial = await db.transaction(async (tx) => {
            const [existingSubscription] = await tx
                .select({
                    currency: subscriptions.currency,
                    active: subscriptions.active,
                    deactivatedAt: subscriptions.deactivatedAt,
                    categoryId: subscriptions.categoryId,
                })
                .from(subscriptions)
                .where(
                    and(
                        eq(subscriptions.id, id),
                        eq(subscriptions.ledgerId, ledger.id),
                    ),
                )
                .limit(1)
                .for("update");

            if (!existingSubscription) {
                return { status: 404 as const, body: { error: "Subscription not found" } };
            }
            if (data.currency !== existingSubscription.currency) {
                return {
                    status: 400 as const,
                    body: { error: "Currency cannot be changed for an existing record" },
                };
            }

            const now = new Date();
            const endDate = subscriptionEndDate(data.endDate);
            const expired = endDate < now;
            const shouldBeActive = data.active ?? existingSubscription.active;
            if (shouldBeActive && expired) {
                return {
                    status: 400 as const,
                    body: { error: "An expired subscription cannot be active" },
                };
            }

            const requiresCustomCategoryFeature =
                category.isCustom &&
                category.id !== existingSubscription.categoryId;

            if (!requiresCustomCategoryFeature) {
                const rows = await tx
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
                        ...taxPatch,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(subscriptions.id, id),
                            eq(subscriptions.ledgerId, ledger.id),
                        ),
                    )
                    .returning({ id: subscriptions.id });
                // The subscription decides the tax treatment of every charge it has
                // recorded, so the tax summary never disagrees with the subscription.
                if (rows.length > 0 && data.taxKind !== undefined) {
                    await tx
                        .update(transactions)
                        .set({ taxKind: data.taxKind, updatedAt: new Date() })
                        .where(
                            and(
                                eq(transactions.subscriptionId, id),
                                eq(transactions.ledgerId, ledger.id),
                            ),
                        );
                }
                return { status: 200 as const, rows };
            }

            return {
                status: 202 as const,
                existingCategoryId: existingSubscription.categoryId,
            };
        });

        if (initial.status !== 200 && initial.status !== 202) {
            return NextResponse.json(initial.body, { status: initial.status });
        }

        let updated: { id: string }[];
        if (initial.status === 200) {
            updated = initial.rows;
        } else {
            // Run feature access outside the locked tx to avoid holding a pooled
            // connection while canUseFeature acquires its own connection(s).
            updated = [];
            for (let attempt = 0; attempt < 2; attempt++) {
                if (!(await canUseFeature(userId, "customCategories"))) {
                    return NextResponse.json(
                        { error: "Upgrade your plan to use custom categories" },
                        { status: 403 },
                    );
                }

                const final = await db.transaction(async (tx) => {
                    const [existingSubscription] = await tx
                        .select({
                            currency: subscriptions.currency,
                            active: subscriptions.active,
                            deactivatedAt: subscriptions.deactivatedAt,
                            categoryId: subscriptions.categoryId,
                        })
                        .from(subscriptions)
                        .where(
                            and(
                                eq(subscriptions.id, id),
                                eq(subscriptions.ledgerId, ledger.id),
                            ),
                        )
                        .limit(1)
                        .for("update");

                    if (!existingSubscription) {
                        return { status: 404 as const, body: { error: "Subscription not found" } };
                    }
                    if (data.currency !== existingSubscription.currency) {
                        return {
                            status: 400 as const,
                            body: { error: "Currency cannot be changed for an existing record" },
                        };
                    }

                    const now = new Date();
                    const endDate = subscriptionEndDate(data.endDate);
                    const expired = endDate < now;
                    const shouldBeActive = data.active ?? existingSubscription.active;
                    if (shouldBeActive && expired) {
                        return {
                            status: 400 as const,
                            body: { error: "An expired subscription cannot be active" },
                        };
                    }

                    const requiresCustomCategoryFeature =
                        category.isCustom &&
                        category.id !== existingSubscription.categoryId;
                    if (requiresCustomCategoryFeature) {
                        // Recheck outside the tx on the next attempt; never call
                        // canUseFeature while holding this transaction/lock.
                        return { status: 409 as const, body: { error: "retry" } };
                    }

                    const rows = await tx
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
                            ...taxPatch,
                            updatedAt: new Date(),
                        })
                        .where(
                            and(
                                eq(subscriptions.id, id),
                                eq(subscriptions.ledgerId, ledger.id),
                            ),
                        )
                        .returning({ id: subscriptions.id });
                    if (rows.length > 0 && data.taxKind !== undefined) {
                        await tx
                            .update(transactions)
                            .set({ taxKind: data.taxKind, updatedAt: new Date() })
                            .where(
                                and(
                                    eq(transactions.subscriptionId, id),
                                    eq(transactions.ledgerId, ledger.id),
                                ),
                            );
                    }
                    return { status: 200 as const, rows };
                });

                if (final.status === 409) {
                    continue;
                }
                if (final.status !== 200) {
                    return NextResponse.json(final.body, { status: final.status });
                }
                updated = final.rows;
                break;
            }
            if (updated.length === 0) {
                // Extremely rare contention: state kept changing. Fail safely.
                if (!(await canUseFeature(userId, "customCategories"))) {
                    return NextResponse.json(
                        { error: "Upgrade your plan to use custom categories" },
                        { status: 403 },
                    );
                }
                return NextResponse.json(
                    { error: "Could not save the subscription" },
                    { status: 409 },
                );
            }
        }

        if (updated.length === 0) {
            return NextResponse.json(
                { error: "Subscription not found" },
                { status: 404 },
            );
        }

        await syncActiveSubscriptionUsage(db, userId);

        return NextResponse.json({ success: true, data: updated[0] });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
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

export async function DELETE(req: Request, { params }: Params) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const ledger = await requireLedger(req, userId);

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
                        eq(transactions.ledgerId, ledger.id),
                    ),
                )
                .returning({ id: transactions.id });

            const removedSubscriptions = await tx
                .delete(subscriptions)
                .where(
                    and(
                        eq(subscriptions.id, id),
                        eq(subscriptions.ledgerId, ledger.id),
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

        await syncActiveSubscriptionUsage(db, userId);

        return NextResponse.json({
            success: true,
            data: { ...deleted[0], ledgerRowsRemoved: ledgerRows.length },
        });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Subscription delete failed:", error);
        return NextResponse.json(
            { error: "Could not delete the subscription" },
            { status: 500 },
        );
    }
}
