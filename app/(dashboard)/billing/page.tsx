import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { BadgeCheck, Sparkles } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Billing" };

/*
  Billing lives inside the app, not on the public /pricing page — a signed-in
  user clicking "Upgrade to Pro" shouldn't be thrown back to a marketing
  surface with a sign-up button in it.

  Server component on purpose: this is one query against the caller's own
  subscription, and pulling it through Refine would mean a second provider and
  a loading state for data we already have in hand.
*/
export default async function BillingPage() {
    const { userId } = await auth();

    const [availablePlans, current] = await Promise.all([
        db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.price)),
        userId
            ? db
                  .select({ subscription: app_subscriptions, plan: plans })
                  .from(app_subscriptions)
                  .innerJoin(plans, eq(app_subscriptions.planId, plans.id))
                  .where(eq(app_subscriptions.userId, userId))
                  .limit(1)
            : Promise.resolve([]),
    ]);

    const currentPlan = current[0]?.plan ?? null;
    const subscription = current[0]?.subscription ?? null;

    return (
        <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-6 py-6">
                    <header className="px-4 lg:px-6">
                        <h1 className="text-2xl font-bold tracking-tight">
                            Billing &amp; plan
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            You&apos;re currently on{" "}
                            <span className="font-medium text-foreground">
                                {currentPlan?.name ?? "no plan"}
                            </span>
                            .
                        </p>
                    </header>

                    {subscription && (
                        <Card className="mx-4 lg:mx-6">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BadgeCheck
                                        className="h-5 w-5 text-primary"
                                        aria-hidden="true"
                                    />
                                    Current subscription
                                </CardTitle>
                                <CardDescription>
                                    Renews{" "}
                                    {new Date(
                                        subscription.currentPeriodEnd,
                                    ).toLocaleDateString()}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 sm:grid-cols-3">
                                <Detail label="Plan" value={currentPlan?.name} />
                                <Detail
                                    label="Price"
                                    value={
                                        currentPlan
                                            ? `${currentPlan.price} ${currentPlan.currency}/${currentPlan.interval}`
                                            : undefined
                                    }
                                />
                                <Detail
                                    label="Status"
                                    value={
                                        subscription.status === "active"
                                            ? "Active"
                                            : subscription.status
                                    }
                                />
                            </CardContent>
                        </Card>
                    )}

                    <div className="grid gap-4 px-4 lg:grid-cols-3 lg:px-6">
                        {availablePlans.map((plan) => {
                            const isCurrent = plan.id === currentPlan?.id;
                            return (
                                <Card
                                    key={plan.id}
                                    className={
                                        isCurrent
                                            ? "border-primary"
                                            : undefined
                                    }
                                >
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between">
                                            {plan.name}
                                            {isCurrent && (
                                                <Badge>Current plan</Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription>
                                            {plan.description}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-4">
                                        <p className="text-3xl font-bold">
                                            {plan.price}
                                            <span className="text-sm font-normal text-muted-foreground">
                                                /{plan.interval}
                                            </span>
                                        </p>
                                        {plan.features?.length ? (
                                            <ul className="flex flex-col gap-2 text-sm">
                                                {plan.features.map((f) => (
                                                    <li
                                                        key={f}
                                                        className="flex items-start gap-2"
                                                    >
                                                        <span
                                                            aria-hidden="true"
                                                            className="mt-0.5 text-primary"
                                                        >
                                                            ✓
                                                        </span>
                                                        {f}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                    </CardContent>
                                    <CardFooter>
                                        {isCurrent ? (
                                            <p className="w-full text-center text-sm text-muted-foreground">
                                                This is your plan.
                                            </p>
                                        ) : (
                                            <Button
                                                className="w-full"
                                                disabled
                                                title="Checkout isn't available yet"
                                            >
                                                <Sparkles
                                                    aria-hidden="true"
                                                    className="me-2 h-4 w-4"
                                                />
                                                Upgrade
                                            </Button>
                                        )}
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>

                    <p className="px-4 text-sm text-muted-foreground lg:px-6">
                        Payments are coming soon — upgrading isn&apos;t
                        available yet. In the meantime your data is fully
                        accessible.{" "}
                        <Link
                            href="/settings"
                            className="text-primary underline underline-offset-2"
                        >
                            Manage account
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </dt>
            <dd className="mt-1 font-medium capitalize">{value ?? "—"}</dd>
        </div>
    );
}
