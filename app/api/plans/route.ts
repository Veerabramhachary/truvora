// app/api/plans/route.ts
import { db } from "@/db";
import { plans } from "@/db/schema/plans";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
    interval: z.enum(["month", "year"]).default("month"),
    currency: z.literal("INR").default("INR"),
});

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = request.nextUrl;
        const query = querySchema.safeParse({
            interval: searchParams.get("interval"),
            currency: searchParams.get("currency") ?? undefined,
        });

        if (!query.success) {
            return NextResponse.json(
                {
                    error: "Invalid query parameters",
                    details: query.error.flatten(),
                },
                { status: 400 },
            );
        }

        const { interval, currency } = query.data;

        const data = await db
            .select()
            .from(plans)
            .where(
                and(
                    eq(plans.currency, currency),
                    eq(plans.interval, interval),
                    eq(plans.isActive, true),
                ),
            )
            .orderBy(plans.price);

        return NextResponse.json(data, {
            status: 200,
            headers: {
                "Cache-Control":
                    "public, s-maxage=60, stale-while-revalidate=120",
            },
        });
    } catch (error) {
        console.error("Failed to fetch plans:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
