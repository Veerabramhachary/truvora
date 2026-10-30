import { createHash, randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkRateLimits, rateLimitResponse } from "@/lib/rate-limit";
import { processAccountDeletion, queueAccountDeletion } from "@/lib/account-deletion";

export async function DELETE() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limited = rateLimitResponse(
        await checkRateLimits(`user:${userId}:account-deletion`, ["sensitive"]),
    );
    if (limited) return limited;

    const statusToken = randomBytes(32).toString("base64url");
    try {
        await queueAccountDeletion(
            userId,
            createHash("sha256").update(statusToken).digest("hex"),
        );
        let status: "completed" | "pending";
        try {
            status = await processAccountDeletion(userId);
        } catch (error) {
            console.error("Immediate account deletion attempt failed:", error);
            status = "pending";
        }
        return NextResponse.json(
            { status, statusToken },
            { status: status === "completed" ? 200 : 202 },
        );
    } catch (error) {
        console.error("Account deletion request failed:", error);
        return NextResponse.json({ error: "Could not start account deletion" }, { status: 500 });
    }
}
