import { NextRequest, NextResponse } from "next/server";
import {
    findDueAccountDeletions,
    processAccountDeletion,
} from "@/lib/account-deletion";

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return new NextResponse("Cron is not configured", { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const dueDeletions = await findDueAccountDeletions();
        let completed = 0;
        let pending = 0;
        let failed = 0;

        for (const { clerkUserId } of dueDeletions) {
            try {
                if (await processAccountDeletion(clerkUserId) === "completed") completed++;
                else pending++;
            } catch (error) {
                console.error(`Account deletion retry failed for ${clerkUserId}:`, error);
                failed++;
            }
        }

        return NextResponse.json({
            success: failed === 0,
            attempted: dueDeletions.length,
            completed,
            pending,
            failed,
        });
    } catch (error) {
        console.error("Account deletion retry job failed:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
