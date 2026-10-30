import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
    platformDiscountRedemptions,
    platformDiscounts,
} from "@/db/schema/platform-discounts";
import { users } from "@/db/schema/users";

type DiscountReservation = {
    id: string;
    couponId: string;
};

/**
 * Reserves one campaign slot for a newly referred user. The campaign row lock
 * serializes reservations so concurrent checkouts cannot exceed its limit.
 */
export async function reservePlatformDiscount(
    userId: string,
): Promise<DiscountReservation | null> {
    return db.transaction(async (tx) => {
        const [user] = await tx
            .select({
                platformDiscountId: users.platformDiscountId,
                referralPlatform: users.referralPlatform,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (!user?.platformDiscountId || !user.referralPlatform) return null;

        await tx.execute(sql`
            select ${platformDiscounts.id}
            from ${platformDiscounts}
            where ${platformDiscounts.id} = ${user.platformDiscountId}
            for update
        `);

        const [campaign] = await tx
            .select()
            .from(platformDiscounts)
            .where(eq(platformDiscounts.id, user.platformDiscountId))
            .limit(1);
        const now = new Date();

        if (
            !campaign ||
            !campaign.isActive ||
            campaign.platform !== user.referralPlatform ||
            !campaign.providerCouponId ||
            campaign.maxRedemptions < 1 ||
            (campaign.startsAt && campaign.startsAt > now) ||
            (campaign.endsAt && campaign.endsAt <= now)
        ) {
            return null;
        }

        const [existing] = await tx
            .select()
            .from(platformDiscountRedemptions)
            .where(
                and(
                    eq(platformDiscountRedemptions.campaignId, campaign.id),
                    eq(platformDiscountRedemptions.userId, userId),
                ),
            )
            .limit(1);

        if (existing?.status === "reserved" || existing?.status === "redeemed") {
            return null;
        }

        const [usage] = await tx
            .select({ total: count() })
            .from(platformDiscountRedemptions)
            .where(
                and(
                    eq(platformDiscountRedemptions.campaignId, campaign.id),
                    inArray(platformDiscountRedemptions.status, [
                        "reserved",
                        "redeemed",
                    ]),
                ),
            );

        if ((usage?.total ?? 0) >= campaign.maxRedemptions) return null;

        const nowAt = new Date();
        if (existing) {
            await tx
                .update(platformDiscountRedemptions)
                .set({
                    status: "reserved",
                    checkoutSessionId: null,
                    reservedAt: nowAt,
                    redeemedAt: null,
                    updatedAt: nowAt,
                })
                .where(eq(platformDiscountRedemptions.id, existing.id));
            return { id: existing.id, couponId: campaign.providerCouponId };
        }

        const [redemption] = await tx
            .insert(platformDiscountRedemptions)
            .values({
                campaignId: campaign.id,
                userId,
                status: "reserved",
                reservedAt: nowAt,
                updatedAt: nowAt,
            })
            .returning({ id: platformDiscountRedemptions.id });

        if (!redemption) {
            throw new Error("Could not reserve platform discount");
        }

        return { id: redemption.id, couponId: campaign.providerCouponId };
    });
}

export async function attachCheckoutSession(
    redemptionId: string,
    checkoutSessionId: string,
) {
    await db
        .update(platformDiscountRedemptions)
        .set({ checkoutSessionId, updatedAt: new Date() })
        .where(eq(platformDiscountRedemptions.id, redemptionId));
}

export async function updatePlatformDiscountRedemption(
    redemptionId: string | null | undefined,
    checkoutSessionId: string | null,
    status: "redeemed" | "released",
) {
    if (!redemptionId) return;

    await db
        .update(platformDiscountRedemptions)
        .set({
            status,
            checkoutSessionId,
            redeemedAt: status === "redeemed" ? new Date() : null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(platformDiscountRedemptions.id, redemptionId),
                eq(platformDiscountRedemptions.status, "reserved"),
            ),
        );
}
