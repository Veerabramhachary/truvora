import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { app_subscriptions } from "@/db/schema/plans";

export async function POST(req: NextRequest) {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
        throw new Error(
            "Please add CLERK_WEBHOOK_SECRECT from clerk Dashboard to .env",
        );
    }

    const headerPayLoad = await headers();
    const svixId = headerPayLoad.get("svix-id");
    const svixTimestamp = headerPayLoad.get("svix-timestamp");
    const svixSignature = headerPayLoad.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
        return new Response("Error: Missing Svix headers", { status: 400 });
    }

    const payload = await req.json();
    const body = JSON.stringify(payload);

    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: WebhookEvent;

    try {
        evt = wh.verify(body, {
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
        }) as WebhookEvent;
    } catch (error) {
        console.error("Error verifying webhook", error);
        return NextResponse.json({ error: "Error verifying webhook" }, { status: 400 });
    }

    const eventType = evt.type;
    try {
        if (eventType === "user.created" || eventType === "user.updated") {
            const { id, email_addresses, first_name, image_url } = evt.data;

            const primaryEmail =
                email_addresses.find(
                    (e) => e.id === evt.data.primary_email_address_id,
                )?.email_address || email_addresses[0]?.email_address;

            if (!primaryEmail) {
                return NextResponse.json(
                    { error: "No primary email found" },
                    { status: 400 },
                );
            }

            await db
                .insert(users)
                .values({
                    id,
                    email: primaryEmail,
                    firstName: first_name,
                    imageUrl: image_url,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: users.id,
                    set: {
                        email: primaryEmail,
                        firstName: first_name,
                        imageUrl: image_url,
                        updatedAt: new Date(),
                    },
                });

            if (eventType === "user.created") {
                const existingSubscription = await db
                    .select()
                    .from(app_subscriptions)
                    .where(eq(app_subscriptions.userId, id))
                    .limit(1);

                if (existingSubscription.length === 0) {
                    const now = new Date();
                    const farFuture = new Date();
                    farFuture.setFullYear(now.getFullYear() + 100);

                    await db.insert(app_subscriptions).values({
                        userId: id,
                        planId: "0a4f0b21-7872-45c9-8291-0addedfcc464",
                        status: "active",
                        provider: "none",
                        currentPeriodStart: now,
                        currentPeriodEnd: farFuture,
                        cancelAtPeriodEnd: false,
                        createdAt: now,
                        updatedAt: now,
                    });
                }
            }
        }

        if (eventType === "user.deleted") {
            const { id } = evt.data;
            if (id) {
                await db
                    .delete(app_subscriptions)
                    .where(eq(app_subscriptions.userId, id));
                await db.delete(users).where(eq(users.id, id));
            }
        }
    } catch {
        return NextResponse.json({ error: "Error processing event" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}
