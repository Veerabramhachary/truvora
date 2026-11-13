import { NextRequest, NextResponse } from "next/server";
import { processSubscriptionRenewals } from "@/lib/subscription-renewals";
import { authorizeCron } from "@/lib/cron-auth";

/**
 * Daily renewal job (F-02/F-03). For every subscription whose `nextDate` has
 * passed it records the missed charges in the subscription's own ledger and
 * moves `nextDate` forward. Schedule it BEFORE the reminder cron so reminders
 * see the advanced dates.
 *
 * `?dryRun=1` reports what would happen and writes nothing.
 */
export async function GET(request: NextRequest) {
    const denied = authorizeCron(request);
    if (denied) return denied;

    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    try {
        const summary = await processSubscriptionRenewals({ dryRun });
        // Per-row failures are already logged; surface them to the scheduler.
        return NextResponse.json(
            { success: summary.failed === 0, ...summary },
            { status: summary.failed === 0 ? 200 : 500 },
        );
    } catch (error) {
        console.error("Subscription renewal job failed:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
