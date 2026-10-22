import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET() {
    try {
        const prices = await stripe.prices.list({
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
