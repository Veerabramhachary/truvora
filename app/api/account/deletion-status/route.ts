import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accountDeletions } from "@/db/schema/account-deletions";

export async function GET(request: NextRequest) {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : "";
    if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tokenHash = createHash("sha256").update(token).digest();
    const [deletion] = await db
        .select({
            status: accountDeletions.status,
            statusTokenHash: accountDeletions.statusTokenHash,
            completedAt: accountDeletions.completedAt,
        })
        .from(accountDeletions)
        .where(eq(accountDeletions.statusTokenHash, tokenHash.toString("hex")))
        .limit(1);

    if (!deletion?.statusTokenHash) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const storedHash = Buffer.from(deletion.statusTokenHash, "hex");
    if (
        storedHash.length !== tokenHash.length ||
        !timingSafeEqual(storedHash, tokenHash)
    ) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
        status: deletion.status,
        completedAt: deletion.completedAt,
    });
}
