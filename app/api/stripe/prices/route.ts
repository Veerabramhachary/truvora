import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET() {
    try {
        const prices = await stripe.prices.list({
            active: true,
            expand: ["data.product"],
        });
        NextResponse.json(prices.data)
    }catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({error: message}, { status: 500})
    }
}