import { auth } from "@clerk/nextjs/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ledgers } from "@/db/schema/ledgers";
import {
    createBusinessLedger,
    getOrCreatePersonalLedger,
    ledgerErrorResponse,
} from "@/lib/ledger";

const createLedgerSchema = z
    .object({ name: z.string().trim().min(1, "Enter a name").max(40, "Name is too long") })
    .strict();

const summary = {
    id: ledgers.id,
    type: ledgers.type,
    name: ledgers.name,
};

/** Lists the caller's active ledgers, personal first. Creates the personal one if missing. */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await getOrCreatePersonalLedger(userId);

        const rows = await db
            .select(summary)
            .from(ledgers)
            .where(and(eq(ledgers.ownerUserId, userId), isNull(ledgers.archivedAt)))
            // 'personal' sorts before 'business' in the enum, so personal comes first.
            .orderBy(asc(ledgers.type), asc(ledgers.createdAt));

        return NextResponse.json(rows);
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Failed to list ledgers:", error);
        return NextResponse.json({ error: "Could not load your ledgers" }, { status: 500 });
    }
}

/** Creates the user's business ledger (one active business ledger per user at launch). */
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
        const parsed = createLedgerSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? "Invalid ledger" },
                { status: 400 },
            );
        }

        // Make sure the owner FK target exists / personal ledger is in place first.
        await getOrCreatePersonalLedger(userId);

        const { ledger, created } = await createBusinessLedger(userId, parsed.data.name);
        if (!created) {
            return NextResponse.json(
                { error: "You already have a business ledger" },
                { status: 409 },
            );
        }
        return NextResponse.json(ledger, { status: 201 });
    } catch (error) {
        const ledgerResponse = ledgerErrorResponse(error);
        if (ledgerResponse) return ledgerResponse;
        console.error("Failed to create ledger:", error);
        return NextResponse.json({ error: "Could not create the ledger" }, { status: 500 });
    }
}
