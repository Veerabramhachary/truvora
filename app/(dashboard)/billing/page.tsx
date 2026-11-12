import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { and, asc, eq, gte, or } from "drizzle-orm";
import Link from "next/link";
import { BadgeCheck, Crown, Sparkles } from "lucide-react";
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
import { isRazorpayConfigured } from "@/lib/razorpay";
import { BillingIntervalToggle } from "./BillingIntervalToggle";

export const metadata = { title: "Billing" };

/*
  Fixed three-tier pricing structure mirroring the marketing pricing page.
  The plan *content* (price, features, checkout link) is still resolved from
  the `plans` table so the page stays in sync with seeded data — only the
  card layout and ordering are fixed.
*/
interface TierConfig {
    key: "free" | "starter" | "pro";
    label: string;
    planName: string;
    priceSuffix: string;
    description: string;
    buttonLabel: string;
    featured?: boolean;
}

const TIER_CONFIG: TierConfig[] = [
    {
        key: "free",
        label: "ESSENTIAL",
        planName: "Free",
        priceSuffix: "/ forever",
        description:
            "For individuals organizing everyday personal apps and essential subscriptions.",
        buttonLabel: "Start Free",
    },
    {
        key: "starter",
        label: "GROWTH",
        planName: "Starter",
        priceSuffix: "/ month",
        description:
            "For growing collections, invoice archives, and detailed category breakdowns.",
        buttonLabel: "Choose Starter",
    },
    {
        key: "pro",
        label: "BUSINESS & SCALE",
        planName: "Stroka Pro",
        priceSuffix: "/ month",
        description:
            "For businesses, freelancers, and agencies managing GST & CA tax filing.",
        buttonLabel: "Upgrade to Stroka Pro",
        featured: true,
    },
];

type Interval = "month" | "year";

export default async function BillingPage({
    searchParams,
}: {
    searchParams: Promise<{ interval?: string }>;
}) {
    const { userId } = await auth();
    const { interval = "month" } = (await searchParams) ?? {};
    const billingInterval: Interval =
        interval === "year" ? "year" : "month";

    const [availablePlans, current] = await Promise.all([
        db
            .select()
            .from(plans)
            .where(
                and(
                    eq(plans.isActive, true),
                    eq(plans.currency, "INR"),
                    eq(plans.interval, billingInterval),
                ),
            )
            .orderBy(asc(plans.price)),
        userId
            ? db
                  .select({
                      subscription: app_subscriptions,
                      plan: plans,
                  })
                  .from(app_subscriptions)
                  .innerJoin(plans, eq(app_subscriptions.planId, plans.id))
                  .where(
                      and(
                          eq(app_subscriptions.userId, userId),
                          or(
                              eq(app_subscriptions.status, "active"),
                              eq(app_subscriptions.status, "trialing"),
                          ),
                          gte(app_subscriptions.currentPeriodEnd, new Date()),
                      ),
                  )
                  .limit(1)
            : Promise.resolve([]),
    ]);

    const currentPlan = current[0]?.plan ?? null;
    const subscription = current[0]?.subscription ?? null;
    const paymentsEnabled = isRazorpayConfigured();

    // Resolve the three fixed tiers to actual plan rows for prices + checkout.
    const planByName = (name: string) =>
        availablePlans.find((p) => p.name === name) ?? null;

    const freePlan = planByName("Free");
    const starterPlan = planByName(
        billingInterval === "year" ? "Starter Yearly" : "Starter",
    );
    const proPlan = planByName(
        billingInterval === "year" ? "Stroka Pro Yearly" : "Stroka Pro",
    );

    const tiers = [
        { ...TIER_CONFIG[0], plan: freePlan },
        { ...TIER_CONFIG[1], plan: starterPlan },
        { ...TIER_CONFIG[2], plan: proPlan },
    ];

    return (
        <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-6 py-6">
                    <header className="px-4 lg:px-6">
                        <h1 className="text-2xl font-bold tracking-tight">
                            Billing & plan
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
                                    Current period ends{" "}
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

                    <div className="px-4 lg:px-6">
                        <BillingIntervalToggle
                            currentInterval={billingInterval}
                        />
                    </div>

                    <div className="grid gap-6 px-4 lg:grid-cols-3 lg:px-6">
                        {tiers.map((tier) => {
                            const isCurrent =
                                tier.plan?.id === currentPlan?.id;
                            return (
                                <PricingCard
                                    key={tier.key}
                                    tier={tier}
                                    plan={tier.plan ?? null}
                                    isCurrent={isCurrent}
                                    paymentsEnabled={paymentsEnabled}
                                />
                            );
                        })}
                    </div>

                    <p className="px-4 text-sm text-muted-foreground lg:px-6">
                        {paymentsEnabled
                            ? "Checkout is handled by Razorpay. Your plan is activated only after the payment signature and amount are verified."
                            : "Payments are not configured yet — upgrading isn't available. In the meantime your data is fully accessible."}{" "}
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
            <dd className="mt-1 font-medium capitalize">
                {value ?? "—"}
            </dd>
        </div>
    );
}

function PricingCard({
    tier,
    plan,
    isCurrent,
    paymentsEnabled,
}: {
    tier: TierConfig;
    plan: {
        id: string;
        name: string;
        price: string;
        interval: string;
        features: string[] | null;
        description: string | null;
    } | null;
    isCurrent: boolean;
    paymentsEnabled: boolean;
}) {
    const monthlyPrice = plan
        ? Number(plan.price)
        : null;
    const isFree = monthlyPrice !== null && monthlyPrice <= 0;

    return (
        <Card
            className={[
                "relative",
                isCurrent ? "border-primary" : undefined,
                tier.featured ? "ring-1 ring-primary/50" : undefined,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {tier.featured && (
                <Badge
                    className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-2 py-0.5 rounded-md text-xs font-medium shadow-sm"
                    aria-hidden="true"
                >
                    Featured
                </Badge>
            )}
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                            {tier.label}
                        </p>
                        <CardTitle className="flex items-center gap-1">
                            {tier.planName}
                            {tier.featured && (
                                <Crown
                                    className="h-4 w-4 text-primary"
                                    aria-hidden="true"
                                />
                            )}
                        </CardTitle>
                    </div>
                    {isCurrent && (
                        <Badge variant="secondary">Current plan</Badge>
                    )}
                </div>
                <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="flex items-baseline gap-1">
                    <p className="text-3xl font-bold tracking-tight">
                        {plan ? plan.price : "—"}
                    </p>
                    <span className="text-sm font-normal text-muted-foreground">
                        {tier.priceSuffix}
                    </span>
                </div>
                {plan?.features?.length ? (
                    <ul className="flex flex-col gap-2 text-sm">
                        {plan.features.map((f) => (
                            <li key={f} className="flex items-start gap-2">
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
                ) : isFree ? (
                    <Button
                        className="w-full"
                        variant="outline"
                        asChild
                    >
                        <Link href="/billing">{tier.buttonLabel}</Link>
                    </Button>
                ) : paymentsEnabled && plan ? (
                    <Button className="w-full" asChild>
                        <Link
                            href={`/billing/checkout/${plan.id}`}
                        >
                            {tier.featured ? (
                                <>
                                    <Sparkles
                                        aria-hidden="true"
                                        className="me-2 h-4 w-4"
                                    />
                                    {tier.buttonLabel} →
                                </>
                            ) : (
                                <>
                                    <Sparkles
                                        aria-hidden="true"
                                        className="me-2 h-4 w-4"
                                    />
                                    {tier.buttonLabel}
                                </>
                            )}
                        </Link>
                    </Button>
                ) : (
                    <Button
                        className="w-full"
                        disabled
                        title="Payments are not configured yet"
                    >
                        <Sparkles
                            aria-hidden="true"
                            className="me-2 h-4 w-4"
                        />
                        Payments unavailable
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
