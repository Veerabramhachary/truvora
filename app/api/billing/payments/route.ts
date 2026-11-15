import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getPaymentHistory } from "@/lib/payment-history";

export const runtime = "nodejs";

/** Paid orders and their refunds for the signed-in user only. */
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orders = await getPaymentHistory(userId);
    return NextResponse.json({ orders });
}
