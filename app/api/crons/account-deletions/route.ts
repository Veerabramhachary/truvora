import { NextRequest, NextResponse } from "next/server";
import {
    findDueAccountDeletions,
    processAccountDeletion,
} from "@/lib/account-deletion";
import { authorizeCron } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
    const denied = authorizeCron(request);
    if (denied) return denied;

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
