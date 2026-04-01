import { NextRequest, NextResponse } from "next/server";
import { SubscriptionsDue } from "./subscriptions";
import { Resend } from "resend";
import { EmailTemplate } from "@/components/email-template";



async function sendGroupNotification(
    email: string,
    userName: string,
    subs: any[],
) {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    
    await resend.emails.send({
        from: "Truvora <onboarding@resend.dev>",
        to: email,
        subject: "Upcoming subscriptions update",
        react: EmailTemplate({ userName: userName, subscriptions: subs }),
    });
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const GroupedSubscriptions = await SubscriptionsDue();
        const userIds = Object.keys(GroupedSubscriptions);
        const emailPromises = userIds.map(async (userId) => {
            const userSubs = GroupedSubscriptions[userId];
            if(!userSubs || userSubs.length === 0) return Promise.resolve(null);
            const recipientEmail = userSubs[0].email;

            if (!recipientEmail) {
                return Promise.resolve(null);
            }
            return sendGroupNotification(
                recipientEmail,
                "Valued Member",
                userSubs,
            );
        });

        await Promise.all(emailPromises);
        const results = await Promise.allSettled(emailPromises);
        const failures = results.filter(
            (result) => result.status === "rejected",
        );
        if (failures.length > 0) {
            console.error(`Cron job failed for ${failures.length}`, failures.map((f) => f.reason));
        }



        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Cron job failed:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
