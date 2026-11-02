import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import {
    createBusinessLedger,
    getOrCreatePersonalLedger,
    ledgerErrorResponse,
} from "@/lib/ledger";

const onboardingSchema = z
    .object({
        intent: z.enum(["personal", "business", "both", "skip"]),
        businessName: z.string().trim().max(40, "Name is too long").optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
        const needsBusiness = value.intent === "business" || value.intent === "both";
        if (needsBusiness && !value.businessName) {
            ctx.addIssue({
                code: "custom",
                path: ["businessName"],
                message: "Enter a name for your business",
            });
        }
    });

/**
 * Finishes the sign-up wizard: creates the business ledger when asked for and
 * marks onboarding complete. Safe to repeat: an existing business ledger is
 * reused and the completion time is only ever set once.
 */
export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = onboardingSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? "Invalid request" },
                { status: 400 },
            );
        }
        const { intent, businessName } = parsed.data;

        // The Clerk webhook creates the users row; until it has, nothing below
        // can be saved against this account.
        const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        if (!user) {
            return NextResponse.json(
                { error: "Your account is still being set up. Please try again in a moment." },
                { status: 409 },
            );
        }

        let activeLedgerId: string | null = null;
        if (intent !== "skip") {
            const personal = await getOrCreatePersonalLedger(userId);
            activeLedgerId = personal.id;
            if (intent === "business" || intent === "both") {
                const { ledger } = await createBusinessLedger(userId, businessName!);
                // "Business only" starts in the business ledger.
                if (intent === "business") activeLedgerId = ledger.id;
            }
        }

        const now = new Date();
        await db
            .update(users)
            .set({ onboardingCompletedAt: now, updatedAt: now })
            .where(and(eq(users.id, userId), isNull(users.onboardingCompletedAt)));

        return NextResponse.json({ completed: true, activeLedgerId });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Onboarding failed:", error);
        return NextResponse.json({ error: "Could not finish setup" }, { status: 500 });
    }
}
