import { db } from "@/db";
import { and, eq, gte, lt, or } from "drizzle-orm";
import { addDays, startOfDay } from "date-fns";
import { subscriptions } from "@/db/schema/schema";
import { ledgers } from "@/db/schema/ledgers";
import { users } from "@/db/schema/users";
import { activeSubscriptionNow } from "@/lib/active-subscription";

/**
 * Subscriptions renewing in 1, 3 or 7 days, for every user on every plan
 * (Free included). Renewal reminders are not a paid feature, so there is
 * deliberately no plan or billing condition here.
 *
 * Each row carries the name of the ledger it belongs to, so a user with a
 * personal and a business ledger can tell which one a renewal is for.
 */
export async function SubscriptionsDue() {
    const today = startOfDay(new Date());
    const now = new Date();
    const intervals = [1, 3, 7];
    const dueOnOneOfTheseDays = or(...intervals.map((interval) => {
        const day = addDays(today, interval);
        return and(gte(subscriptions.nextDate, day), lt(subscriptions.nextDate, addDays(day, 1)));
    }));

    const upcoming = await db.select({
        id: subscriptions.id,
        name: subscriptions.name,
        email: users.email,
        firstName: users.firstName,
        nextDate: subscriptions.nextDate,
        userId: subscriptions.userId,
        ledgerName: ledgers.name,
    }).from(subscriptions).where(and(
        activeSubscriptionNow(now),
        dueOnOneOfTheseDays,
    ))
      .innerJoin(ledgers, eq(subscriptions.ledgerId, ledgers.id))
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
