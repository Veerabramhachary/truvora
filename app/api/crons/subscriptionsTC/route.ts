import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/db";
import { reminderDeliveries } from "@/db/schema/reminder-deliveries";
import { EmailTemplate } from "@/components/email-template";
import { SubscriptionsDue } from "./subscriptions";
import type { SubscriptionItem } from "@/components/email-template";

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return new NextResponse("Cron is not configured", { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
    const apiKey = process.env.RESEND_API_KEY;
    const sender = process.env.RENEWAL_EMAIL_FROM;
    if (!apiKey || !sender) return new NextResponse("Email is not configured", { status: 503 });

    try {
        const resend = new Resend(apiKey);
        const due = await SubscriptionsDue();
        let sent = 0;
        let failed = 0;
        const grouped = due.reduce<Record<string, typeof due>>((result, item) => {
            (result[item.userId] ??= []).push(item);
            return result;
        }, {});
        for (const [userId, subs] of Object.entries(grouped)) {
            const email = subs[0]?.email;
            if (!email) continue;
            const claimed: typeof due = [];
            for (const sub of subs) {
                const now = new Date();
                const [delivery] = await db.insert(reminderDeliveries).values({
                    subscriptionId: sub.id, renewalDate: sub.nextDate, daysBefore: sub.daysLeft,
                    status: "sending", claimedAt: now,
                }).onConflictDoNothing().returning({ id: reminderDeliveries.id });
                if (delivery) claimed.push(sub);
                else {
                    // Release abandoned claims after a process crash; normal
                    // send errors below release immediately for prompt retry.
                    const [reclaimed] = await db.update(reminderDeliveries).set({ status: "sending", claimedAt: now })
                        .where(and(eq(reminderDeliveries.subscriptionId, sub.id), eq(reminderDeliveries.renewalDate, sub.nextDate), eq(reminderDeliveries.daysBefore, sub.daysLeft), eq(reminderDeliveries.status, "sending"), lt(reminderDeliveries.claimedAt, new Date(now.getTime() - 10 * 60_000))))
                        .returning({ id: reminderDeliveries.id });
                    if (reclaimed) claimed.push(sub);
                }
            }
            if (!claimed.length) continue;
            const items: SubscriptionItem[] = claimed.map(({ name, daysLeft }) => ({ name: name ?? "Subscription", daysLeft }));
            const idempotencyKey = `renewal-reminder/${createHash("sha256")
                .update(
                    [
                        userId,
                        ...claimed
                            .map(
                                (sub) =>
                                    `${sub.id}:${sub.nextDate.toISOString()}:${sub.daysLeft}`,
                            )
                            .sort(),
                    ].join("|"),
                )
                .digest("hex")}`;
            try {
                const result = await resend.emails.send({
                    from: sender,
                    to: email,
                    subject: "Your subscriptions renew soon",
                    react: EmailTemplate({ userName: subs[0]?.firstName || "there", subscriptions: items }),
                }, { idempotencyKey });
                if (result.error) throw new Error(`Resend rejected send: ${result.error.name}`);
            } catch (error) {
                // Keep claims on uncertain failures. They can be retried after
                // the stale-claim timeout using the same Resend idempotency key.
                console.error(`Renewal reminder send failed for user ${userId}:`, error);
                failed++;
                continue;
            }

            try {
                const sentAt = new Date();
                await db.transaction(async (tx) => {
                    for (const sub of claimed) {
                        await tx
                            .update(reminderDeliveries)
                            .set({ status: "sent", sentAt })
                            .where(
                                and(
                                    eq(reminderDeliveries.subscriptionId, sub.id),
                                    eq(reminderDeliveries.renewalDate, sub.nextDate),
                                    eq(reminderDeliveries.daysBefore, sub.daysLeft),
                                ),
                            );
                    }
                });
                sent++;
            } catch (error) {
                // The provider accepted the email. Leave claims in place so a
                // retry uses the same idempotency key rather than sending again.
                console.error(`Could not record renewal reminder delivery for user ${userId}:`, error);
                failed++;
            }
        }
        return NextResponse.json({ success: true, sent, failed });
    } catch (error) {
        console.error("Cron job failed:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
