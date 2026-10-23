import { NextRequest, NextResponse } from "next/server";
import { SubscriptionsDue } from "./subscriptions";
import { Resend } from "resend";
import { EmailTemplate } from "@/components/email-template";
import type { SubscriptionItem } from "@/components/email-template";

async function sendGroupNotification(
    email: string,
    userName: string,
    subs: SubscriptionItem[],
    apiKey: string,
) {
    const resend = new Resend(apiKey);

    // `send` reports API failures in its return value rather than throwing, so
    // they have to be surfaced here or every send looks like a success and the
    // failure accounting downstream never fires.
    const { error } = await resend.emails.send({
        from: "Truvora <onboarding@resend.dev>",
        to: email,
        subject: "Your subscriptions renew soon",
        react: EmailTemplate({ userName: userName, subscriptions: subs }),
    });

    if (error) {
        throw new Error(`Resend rejected the send: ${error.name}`);
    }
}

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    // Fail closed. With no CRON_SECRET set, the old comparison expected the
    // literal string "Bearer undefined", which any caller could just send.
    if (!secret) {
        console.error("CRON_SECRET is not set — refusing to run the cron.");
        return new NextResponse("Cron is not configured", { status: 503 });
    }
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error("RESEND_API_KEY is not set — cannot send reminders.");
        return new NextResponse("Email is not configured", { status: 503 });
    }

    try {
        const groupedSubscriptions = await SubscriptionsDue();

        const emailPromises = Object.values(groupedSubscriptions).map(
            (userSubs) => {
                const recipientEmail = userSubs[0]?.email;
                if (!recipientEmail) return Promise.resolve(null);
                return sendGroupNotification(
                    recipientEmail,
                    "Valued Member",
                    userSubs,
                    apiKey,
                );
            },
        );

        // Awaiting the same promises twice meant any rejection escaped through
        // the earlier `Promise.all` straight into the outer catch, making the
        // failure log below unreachable and reporting one bad send as a total
        // crash. `allSettled` on its own keeps the run going and counts what
        // actually failed.
        const results = await Promise.allSettled(emailPromises);
        const failures = results.filter(
            (result): result is PromiseRejectedResult =>
                result.status === "rejected",
        );
        if (failures.length > 0) {
            console.error(
                `Renewal reminders: ${failures.length} of ${results.length} sends failed`,
                failures.map((f) => f.reason),
            );
        }

        return NextResponse.json({
            success: true,
            sent: results.length - failures.length,
            failed: failures.length,
        });
    } catch (error) {
        console.error("Cron job failed:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
