import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
    tryConsumeFeature,
    canUseFeature,
} from "@/lib/feature-access";

export async function GET(req: NextRequest) {
    try {
        // 1. Authenticate user
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json(
                { allowed: false, error: "Unauthorized" },
                { status: 401 },
            );
        }

        // 2. Parse query parameters
        const feature = req.nextUrl.searchParams.get("feature");
        const quantityParam = req.nextUrl.searchParams.get("quantity");
        const consumeParam = req.nextUrl.searchParams.get("consume");

        if (!feature) {
            return NextResponse.json(
                { allowed: false, error: "Missing feature parameter" },
                { status: 400 },
            );
        }

        const quantity = quantityParam ? parseInt(quantityParam, 10) : 1;
        if (isNaN(quantity) || quantity < 1) {
            return NextResponse.json(
                { allowed: false, error: "Invalid quantity parameter" },
                { status: 400 },
            );
        }

        const consume = consumeParam === "true";

        // 3. Get subscription gate to access limits (optional – we can directly call canUseFeature/tryConsumeFeature)
        // The helper functions already get the gate internally. We'll just call them.
        let allowed: boolean;
        if (consume) {
            allowed = await tryConsumeFeature(userId, feature as any, quantity);
        } else {
            allowed = await canUseFeature(
                userId,
                feature as any,
                quantity,
                false,
            );
        }

        return Response.json({ allowed });
    } catch (error) {
        console.error("Feature check error:", error);
        return NextResponse.json(
            { allowed: false, error: "Internal server error" },
            { status: 500 },
        );
    }
}
