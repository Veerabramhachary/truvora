import { auth } from "@clerk/nextjs/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { db } from "@/db";
import { app_subscriptions, plans } from "@/db/schema/plans";
import { toPaise } from "@/lib/money";
import { formatCurrency } from "@/lib/currencies";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { RazorpayCheckoutButton } from "./RazorpayCheckoutButton";

export const metadata = {
    title: "Checkout",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const planIdSchema = z.string().uuid();

/**
 * Server-rendered checkout summary.
 *
 * The price and plan come from the database, keyed by the route parameter. The
 * query string is never used as an amount source, so changing the URL cannot
 * change what is charged. The actual charge is created again server-side by
 * `/api/payments/razorpay/order`.
 */
export default async function CheckoutPage({
    params,
}: {
    params: Promise<{ planId: string }>;
}) {
    const { planId } = await params;
    if (!planIdSchema.safeParse(planId).success) notFound();

    // proxy.ts already protects this route. Re-check here so the page is safe
    // if it is ever rendered through a different entry point.
    const { userId } = await auth();
    if (!userId) redirect("/auth/sign-in");

    const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, planId), eq(plans.isActive, true)))
        .limit(1);

    if (!plan || plan.currency.toUpperCase() !== "INR") notFound();
    if (plan.provider !== "none" && plan.provider !== "razorpay") notFound();

    const amountPaise = toPaise(plan.price);
    if (amountPaise < BigInt(100)) redirect("/billing");

    const [current] = await db
        .select({
            planId: app_subscriptions.planId,
        })
        .from(app_subscriptions)
        .where(
            and(
                eq(app_subscriptions.userId, userId),
                inArray(app_subscriptions.status, ["active", "trialing"]),
                gte(app_subscriptions.currentPeriodEnd, new Date()),
            ),
        )
        .limit(1);

    if (current?.planId === plan.id) {
        redirect("/billing");
    }

    const paymentsEnabled = isRazorpayConfigured();
    const price = Number(plan.price);
    const intervalLabel = plan.interval === "year" ? "year" : "month";

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-6">
            <div>
                <Button variant="ghost" size="sm" asChild className="-ms-2">
                    <Link href="/billing">
                        <ArrowLeft aria-hidden="true" />
                        Back to billing
                    </Link>
                </Button>
                <h1 className="mt-3 text-2xl font-bold tracking-tight">
                    Checkout
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Review your plan before paying. Your current plan stays
                    active until the payment is verified.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-3">
                            {plan.name}
                            <Badge variant="secondary">
                                {plan.interval === "year" ? "Yearly" : "Monthly"}
                            </Badge>
                        </CardTitle>
                        <CardDescription>{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                        {plan.features?.length ? (
                            <ul className="grid gap-2 text-sm">
                                {plan.features.map((feature) => (
                                    <li
                                        key={feature}
                                        className="flex items-start gap-2"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="mt-0.5 text-primary"
                                        >
                                            ✓
                                        </span>
                                        <span className="text-muted-foreground">
                                            {feature}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}

                        <div className="flex items-baseline justify-between border-t pt-4">
                            <span className="text-sm text-muted-foreground">
                                Total due today
                            </span>
                            <span className="text-2xl font-bold">
                                {formatCurrency(price, plan.currency)}
                                <span className="ms-1 text-sm font-normal text-muted-foreground">
                                    /{intervalLabel}
                                </span>
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            This purchase grants one billing period. Renewal
                            reminders are still handled by Truvora; automatic
                            card mandates are not enabled.
                        </p>
                    </CardContent>
                    <CardFooter className="flex flex-col items-stretch gap-3">
                        {paymentsEnabled ? (
                            <RazorpayCheckoutButton
                                planId={plan.id}
                                planName={plan.name}
                            />
                        ) : (
                            <Button disabled className="w-full" size="lg">
                                Payments are not configured
                            </Button>
                        )}
                        <Button variant="ghost" className="w-full" asChild>
                            <Link href="/billing">Cancel</Link>
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldCheck
                                className="h-5 w-5 text-primary"
                                aria-hidden="true"
                            />
                            Secure checkout
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
                        <p className="flex items-start gap-2">
                            <LockKeyhole
                                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                                aria-hidden="true"
                            />
                            Payment details are collected by Razorpay. Truvora
                            never receives or stores your card number, CVV or
                            UPI PIN.
                        </p>
                        <p>
                            The amount is fixed on the server from the plan
                            record. It cannot be changed through the URL or the
                            browser request.
                        </p>
                        <p>
                            Your plan is activated only after Razorpay&apos;s
                            payment signature and amount are verified, with a
                            signed webhook as a backup.
                        </p>
                        <p className="text-xs">
                            By continuing you agree to the{" "}
                            <Link
                                href="/terms"
                                className="text-primary underline underline-offset-2"
                            >
                                Terms
                            </Link>{" "}
                            and{" "}
                            <Link
                                href="/privacy-policy"
                                className="text-primary underline underline-offset-2"
                            >
                                Privacy Policy
                            </Link>
                            .
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
