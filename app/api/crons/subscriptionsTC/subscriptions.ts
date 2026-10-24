import { db } from "@/db";
import { and, eq, gte, lt, or } from "drizzle-orm";
import { addDays, startOfDay } from "date-fns";
import { subscriptions } from "@/db/schema/schema";
import { users } from "@/db/schema/users";

export async function SubscriptionsDue() {
    const today = startOfDay(new Date());
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
    }).from(subscriptions).where(and(eq(subscriptions.active, true), dueOnOneOfTheseDays))
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
