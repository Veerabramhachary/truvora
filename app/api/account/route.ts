import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkRateLimits, rateLimitResponse } from "@/lib/rate-limit";

/** Requests Clerk to delete the signed-in identity. The signed user.deleted
 * webhook performs the transactional database cleanup and is safe to retry. */
export async function DELETE() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limited = rateLimitResponse(
        await checkRateLimits(`user:${userId}:account-deletion`, ["sensitive"]),
    );
    if (limited) return limited;

    try {
        const client = await clerkClient();
        await client.users.deleteUser(userId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Account deletion request failed:", error);
        return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
    }
}
