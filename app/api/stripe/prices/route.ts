import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function GET() {
    try {
        const prices = await getStripe().prices.list({
            active: true,
            expand: ["data.product"],
        });
        return NextResponse.json(prices.data);
    } catch (error) {
        console.error("Failed to list Stripe prices:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
