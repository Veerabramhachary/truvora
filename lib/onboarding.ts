import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/users";

/**
 * True while the user still has to finish (or skip) the sign-up wizard.
 *
 * - No `users` row yet (the Clerk webhook is a moment behind): still pending,
 *   the wizard waits for the account to be ready.
 * - `onboarding_completed_at` is NULL: pending. Existing users are backfilled
 *   by migration 0014, so they are never pending.
 * - A database error fails OPEN (not pending): a broken lookup must never lock
 *   someone out of their dashboard.
 */
export async function needsOnboarding(userId: string): Promise<boolean> {
    try {
        const [row] = await db
            .select({ completedAt: users.onboardingCompletedAt })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        return !row || row.completedAt === null;
    } catch (error) {
        console.error("Could not read onboarding status:", error);
        return false;
    }
}
