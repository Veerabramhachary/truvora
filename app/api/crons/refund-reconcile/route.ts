import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { reconcileRefunds } from "@/lib/refund-reconciler";

/**
 * Daily refund safety net (§5.9). Retries refunds whose Razorpay response was
 * lost and refreshes refunds that have been `pending` for more than 8 days.
 *
 * `?dryRun=1` reports what would be checked and calls no provider APIs.
 */
export async function GET(request: NextRequest) {
    const denied = authorizeCron(request);
    if (denied) return denied;

    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    try {
        const summary = await reconcileRefunds({ dryRun });
        return NextResponse.json(
            { success: summary.failed === 0, ...summary },
            { status: summary.failed === 0 ? 200 : 500 },
        );
    } catch (error) {
        console.error("Refund reconciliation failed:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
