import { db } from "@/db";
import { auth } from "@clerk/nextjs/server";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { and, eq } from "drizzle-orm";

export type FeatureLimits = {
    exports?: { limit: number; interval: "month" | "year" | "none" }; // monthly export cap
    subscriptions?: { limit: number }; // max active subscriptions
    charts?: "basic" | "comparative" | "advanced"; // chart type tier
    earlyAccess?: boolean;
    autoRenewal?: boolean;
    reminders?: "email" | "priority" | "customizable" | "personalized";
    exportFormats?: { csv: boolean; pdf: boolean; pdfLevel: "none" | "basic" | "advanced"; xlsx: boolean };
    customCategories?: boolean;
    viewsAndFilters?: boolean;
    notifications?: "email" | "push" | "webhook" | "all";
    webhooks?: boolean;
};

export async function getSubscriptionGate() {
    const { userId } = await auth();

    if (!userId) return;

    const result = await db
        .select({
            subscription: app_subscriptions,
            plan: plans
        })
        .from(app_subscriptions)
        .where(
            and(
                eq(app_subscriptions.userId, userId),
                eq(app_subscriptions.status, "active"),
            ),
        )
        .innerJoin(plans, eq(app_subscriptions.planId, plans.id))
        .limit(1);

        if (result.length === 0) return null;
        const { subscription, plan } = result[0];

    return {
        subscription,
        checkFeatures: (feature: keyof FeatureLimits) => {
            const limits = plan?.featureLimits as
                | FeatureLimits
                | undefined;
            return limits ? limits[feature] : null;
        },
    };
}
