import { db } from "@/db";
import { and, eq, exists, gt, gte, lt, lte, ne, or } from "drizzle-orm";
import { addDays, startOfDay } from "date-fns";
import { subscriptions } from "@/db/schema/schema";
import { users } from "@/db/schema/users";
import { app_subscriptions, plans } from "@/db/schema/plans";

export async function SubscriptionsDue() {
    const today = startOfDay(new Date());
    const now = new Date();
    const intervals = [1, 3, 7];
    const dueOnOneOfTheseDays = or(...intervals.map((interval) => {
        const day = addDays(today, interval);
        return and(gte(subscriptions.nextDate, day), lt(subscriptions.nextDate, addDays(day, 1)));
    }));
    // Renewal reminders are a paid-plan benefit. A positive catalog price by
    // itself is not enough: require a live billing-backed subscription so free
    // defaults, trials, expired periods, and providerless manual assignments
    // do not receive paid reminders. EXISTS avoids duplicate rows when an
    // account has more than one historical app subscription.
    const paidPlanSubscription = db
        .select({ id: app_subscriptions.id })
        .from(app_subscriptions)
        .innerJoin(plans, eq(app_subscriptions.planId, plans.id))
        .where(and(
            eq(app_subscriptions.userId, subscriptions.userId),
            eq(app_subscriptions.status, "active"),
            ne(app_subscriptions.provider, "none"),
            gt(plans.price, "0"),
            lte(app_subscriptions.currentPeriodStart, now),
            gte(app_subscriptions.currentPeriodEnd, now),
        ));

    const upcoming = await db.select({
        id: subscriptions.id,
        name: subscriptions.name,
        email: users.email,
        firstName: users.firstName,
        nextDate: subscriptions.nextDate,
        userId: subscriptions.userId,
    }).from(subscriptions).where(and(
        eq(subscriptions.active, true),
        dueOnOneOfTheseDays,
        exists(paidPlanSubscription),
    ))
      .leftJoin(users, eq(subscriptions.userId, users.id));

    return upcoming.map((sub) => {
        const renewalDay = startOfDay(new Date(sub.nextDate));
        return {
            ...sub,
            nextDate: new Date(sub.nextDate),
            daysLeft: Math.round((renewalDay.getTime() - today.getTime()) / 86400000),
        };
    });
}
