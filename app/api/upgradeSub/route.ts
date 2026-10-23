import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    UpgradeError,
    upgradeSubscription,
} from "@/lib/upgrade-subscription";

const bodySchema = z.object({
    subscriptionId: z.string().uuid("subscriptionId must be a uuid"),
    newPlanId: z.string().uuid("newPlanId must be a uuid"),
    prorationBehavior: z
        .enum(["always_invoice", "create_prorations"])
        .optional(),
});

// API route handler
export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Parse
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }

        const {
            subscriptionId,
            newPlanId,
            prorationBehavior,
        } = parsed.data;

        // Ownership is enforced inside `upgradeSubscription`: both the read and
        // the write are filtered by the authenticated user id.
        await upgradeSubscription({
            userId,
            subscriptionId,
            newPlanId,
            prorationBehavior,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof UpgradeError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }
        console.error("Subscription upgrade error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
