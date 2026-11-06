import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Legacy plan-upgrade endpoint.
 *
 * It used to move a subscription onto any active plan without taking payment
 * (the UI hid the button, but the route was still callable). Razorpay checkout
 * plus `lib/payment-fulfillment` is now the only self-serve path that may
 * change a paid plan, so this route fails closed instead of remaining a free
 * upgrade bypass.
 */
export async function POST() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
        {
            error: "Plan changes require a completed checkout.",
            code: "PAYMENT_REQUIRED",
        },
        { status: 402 },
    );
}
