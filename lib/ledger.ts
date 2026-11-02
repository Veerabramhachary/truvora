import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ledgers, type Ledger } from "@/db/schema/ledgers";

import { LEDGER_HEADER } from "@/lib/ledger-header";

export { LEDGER_HEADER };

const ledgerIdSchema = z.string().uuid();

/** An expected, user-facing failure while resolving the active ledger. */
export class LedgerError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 404 | 409,
    ) {
        super(message);
        this.name = "LedgerError";
    }
}

/** Converts a LedgerError into a JSON response; returns null for anything else. */
export function ledgerErrorResponse(error: unknown): NextResponse | null {
    if (!(error instanceof LedgerError)) return null;
    return NextResponse.json({ error: error.message }, { status: error.status });
}

async function findPersonalLedger(userId: string): Promise<Ledger | undefined> {
    const [ledger] = await db
        .select()
        .from(ledgers)
        .where(
            and(
                eq(ledgers.ownerUserId, userId),
                eq(ledgers.type, "personal"),
                isNull(ledgers.archivedAt),
            ),
        )
        .limit(1);
    return ledger;
}

/**
 * Returns the user's personal ledger, creating it on first use so new users
 * (and any user the backfill missed) never hit a missing-ledger state.
 */
export async function getOrCreatePersonalLedger(userId: string): Promise<Ledger> {
    const existing = await findPersonalLedger(userId);
    if (existing) return existing;

    try {
        // The partial unique index makes concurrent first requests safe: the
        // loser's insert is ignored and the re-select below finds the winner.
        await db
            .insert(ledgers)
            .values({ ownerUserId: userId, type: "personal", name: "Personal" })
            .onConflictDoNothing();
    } catch (error) {
        // Most likely the owner FK: the Clerk webhook has not created the
        // `users` row yet. Fall through to the re-select / 409 below.
        console.error("Could not create personal ledger:", error);
    }

    const created = await findPersonalLedger(userId);
    if (!created) {
        throw new LedgerError(
            "Your account is still being set up. Please try again in a moment.",
            409,
        );
    }
    return created;
}

/**
 * THE authorization choke point for financial data. Every route that reads or
 * writes expenses, transactions, subscriptions or custom categories must call
 * this and scope its queries by `ledger.id`.
 *
 * - `x-ledger-id` present: the ledger must exist, be owned by `userId` and not
 *   be archived. Someone else's ledger is indistinguishable from a missing one
 *   (404), so ids cannot be probed.
 * - header absent: the user's personal ledger (keeps old clients working).
 *
 * Phase 3 (workspaces) changes only the ownership check in this function.
 */
export async function requireLedger(req: Request, userId: string): Promise<Ledger> {
    const raw = req.headers.get(LEDGER_HEADER);
    if (raw === null || raw === "") return getOrCreatePersonalLedger(userId);

    if (!ledgerIdSchema.safeParse(raw).success) {
        throw new LedgerError("Invalid ledger id", 400);
    }

    const [ledger] = await db
        .select()
        .from(ledgers)
        .where(
            and(
                eq(ledgers.id, raw),
                eq(ledgers.ownerUserId, userId),
                isNull(ledgers.archivedAt),
            ),
        )
        .limit(1);
    if (!ledger) throw new LedgerError("Ledger not found", 404);
    return ledger;
}

export type LedgerSummaryRow = Pick<Ledger, "id" | "type" | "name">;

/**
 * Creates the user's business ledger. Launch rule: at most one active
 * business ledger per user (an application rule, not a schema constraint, so
 * Phase 3 can lift it without a migration).
 *
 * Returns `created: false` with the existing ledger when one already exists,
 * so callers choose their own behaviour: the ledgers API answers 409, the
 * onboarding wizard treats it as success so a retry after a partial failure
 * just works.
 */
export async function createBusinessLedger(
    userId: string,
    name: string,
): Promise<{ ledger: LedgerSummaryRow; created: boolean }> {
    const summary = { id: ledgers.id, type: ledgers.type, name: ledgers.name };
    return db.transaction(async (tx) => {
        // Serialize concurrent creates for one user so the cap cannot be raced.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ledger:${userId}`}))`);
        const [existing] = await tx
            .select(summary)
            .from(ledgers)
            .where(
                and(
                    eq(ledgers.ownerUserId, userId),
                    eq(ledgers.type, "business"),
                    isNull(ledgers.archivedAt),
                ),
            )
            .limit(1);
        if (existing) return { ledger: existing, created: false };

        const [row] = await tx
            .insert(ledgers)
            .values({ ownerUserId: userId, type: "business", name })
            .returning(summary);
        return { ledger: row, created: true };
    });
}
