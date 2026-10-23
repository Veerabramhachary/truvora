import { db } from "@/db"; // your Drizzle database instance
import { and, eq, gte, lt, or } from "drizzle-orm";
import { addDays, startOfDay } from "date-fns";
import { subscriptions } from "@/db/schema/schema";
import { users } from "@/db/schema/users";

type GroupedSubscriptions = {
    [userId: string]: Array<{
        name: string;
        email: string | null;
        daysLeft: number;
    }>;
};

export async function SubscriptionsDue() {
    const today = startOfDay(new Date());
    const intervals = [1, 3, 7];

    /*
      A half-open [day, day + 1) window per target day, not an exact timestamp
      match. `nextDate` is a full timestamp inherited from `startDate` (see
      nextRenewalDate in app/api/subscriptions/schema.ts), so comparing it to
      midnight matched almost nothing — this reminder cron effectively never
      fired.
    */
    const dueOnOneOfTheseDays = or(
        ...intervals.map((interval) => {
            const day = addDays(today, interval);
            return and(
                gte(subscriptions.nextDate, day),
                lt(subscriptions.nextDate, addDays(day, 1)),
            );
        }),
    );

    const upcoming = await db
        .select({
            name: subscriptions.name,
            email: users.email,
            nextDate: subscriptions.nextDate,
            userId: subscriptions.userId,
        })
        .from(subscriptions)
        .where(and(eq(subscriptions.active, true), dueOnOneOfTheseDays))
        .leftJoin(users, eq(subscriptions.userId, users.id));

    return upcoming.reduce<GroupedSubscriptions>((acc, sub) => {
        const userId = sub.userId;
        if (!acc[userId]) {
            acc[userId] = [];
        }

        const nextDate = startOfDay(new Date(sub.nextDate)).getTime();
        const dateLeft = Math.round(
            (nextDate - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        acc[sub.userId].push({
            name: sub.name,
            email: sub.email,
            daysLeft: dateLeft,
        });

        return acc;
    }, {});
}
