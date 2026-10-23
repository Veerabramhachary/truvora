import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
    tryConsumeFeature,
    canUseFeature,
    getFeatureLimit,
} from "@/lib/feature-access";
import type { FeatureLimits } from "@/lib/subscription";

/*
  `feature` arrives as an arbitrary query string but the gate helpers take
  `keyof FeatureLimits`. Casting it (`as any`) let any string through — this
  list is the actual allow-list, so an unknown name gets a 400 instead of
  silently resolving to a limit nobody defined.
*/
const FEATURE_KEYS = [
    "exports",
    "subscriptions",
    "charts",
    "earlyAccess",
    "autoRenewal",
    "reminders",
    "notifications",
    "webhooks",
] as const satisfies ReadonlyArray<keyof FeatureLimits>;

function isFeatureKey(value: string): value is keyof FeatureLimits {
    return (FEATURE_KEYS as readonly string[]).includes(value);
}

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
        if (!isFeatureKey(feature)) {
            return NextResponse.json(
                { allowed: false, error: "Unknown feature parameter" },
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
            allowed = await tryConsumeFeature(userId, feature, quantity);
        } else {
            allowed = await canUseFeature(userId, feature, quantity, false);
        }

        if (feature === "charts") {
            const limit = await getFeatureLimit(userId, "charts");
            return NextResponse.json({ allowed: limit !== null, limit });
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
