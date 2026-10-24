import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, subscriptions, transactions } from "@/db/schema/schema";
import {
    ONGOING_END_DATE,
    nextRenewalDate,
    subscriptionSchema,
} from "../schema";

type Params = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

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

        const data = subscriptionSchema.parse(body);

        const [existingSubscription] = await db.select({ currency: subscriptions.currency })
            .from(subscriptions)
            .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
            .limit(1);
        if (!existingSubscription) {
            return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
        }
        if (data.currency !== existingSubscription.currency) {
            return NextResponse.json({ error: "Currency cannot be changed for an existing record" }, { status: 400 });
        }

        const categoryResult = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.name, data.category));

        const category = categoryResult[0];
        if (!category) {
            return NextResponse.json(
                { error: "Category not found" },
                { status: 404 },
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
                endDate: data.endDate ?? ONGOING_END_DATE,
                nextDate:
                    data.nextDate ??
                    (data.endDate ??
                        nextRenewalDate(
                            data.startDate,
                            data.interval,
                            data.intervalCount,
                        )),
                categoryId: category.id,
                note: data.note || null,
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

        // `transactions.subscription_id` is a foreign key onto subscriptions,
        // so the ledger rows have to go first.
        const ledgerRows = await db
            .delete(transactions)
            .where(
                and(
                    eq(transactions.subscriptionId, id),
                    eq(transactions.userId, userId),
                ),
            )
            .returning({ id: transactions.id });

        const deleted = await db
            .delete(subscriptions)
            .where(
                and(
                    eq(subscriptions.id, id),
                    eq(subscriptions.userId, userId),
                ),
            )
            .returning({ id: subscriptions.id });

        if (deleted.length === 0) {
            return NextResponse.json(
                { error: "Subscription not found" },
                { status: 404 },
            );
        }

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
