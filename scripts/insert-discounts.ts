import { db, closeDb } from "@/db";
import { platformDiscounts } from "@/db/schema/platform-discounts";
import { and, eq, notInArray, type InferInsertModel } from "drizzle-orm";

type DiscountData = Pick<
    InferInsertModel<typeof platformDiscounts>,
    | "platform"
    | "name"
    | "discountType"
    | "discountValue"
    | "currency"
    | "duration"
    | "durationInMonths"
    | "maxRedemptions"
    | "metadata"
>;

const discountData: DiscountData[] = [
    {
        platform: "producthunt",
        name: "Product Hunt launch",
        discountType: "percent",
        discountValue: "20.00",
        currency: "INR",
        duration: "once",
        durationInMonths: null,
        maxRedemptions: 500,
        metadata: { source: "producthunt", tier: "first-month" },
    },
    {
        platform: "twitter",
        name: "Twitter referral",
        discountType: "percent",
        discountValue: "15.00",
        currency: "INR",
        duration: "once",
        durationInMonths: null,
        maxRedemptions: 300,
        metadata: { source: "twitter", tier: "first-month" },
    },
    {
        platform: "linkedin",
        name: "LinkedIn referral",
        discountType: "amount",
        discountValue: "50.00",
        currency: "INR",
        duration: "once",
        durationInMonths: null,
        maxRedemptions: 200,
        metadata: { source: "linkedin", tier: "first-month" },
    },
];

async function seedDiscounts() {
    const platforms = discountData.map((d) => d.platform);
    await db
        .update(platformDiscounts)
        .set({ isActive: false })
        .where(
            and(
                eq(platformDiscounts.currency, "INR"),
                eq(platformDiscounts.isActive, true),
                notInArray(platformDiscounts.platform, platforms),
            ),
        );

    const now = new Date();
    for (const discount of discountData) {
        const values = {
            ...discount,
            currency: "INR",
            startsAt: now,
            endsAt: null,
            metadata: discount.metadata ?? {},
        };
        const [existing] = await db
            .select({ id: platformDiscounts.id })
            .from(platformDiscounts)
            .where(eq(platformDiscounts.platform, discount.platform))
            .limit(1);

        if (existing) {
            await db
                .update(platformDiscounts)
                .set(values)
                .where(eq(platformDiscounts.id, existing.id));
        } else {
            await db.insert(platformDiscounts).values(values);
        }
    }
}

seedDiscounts()
    .then(closeDb)
    .catch(async (error) => {
        console.error("Failed to seed discounts:", error);
        await closeDb();
        process.exitCode = 1;
    });
