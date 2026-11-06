import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { CheckCircle2, Clock3 } from "lucide-react";
import { db } from "@/db";
import { app_subscriptions } from "@/db/schema/plans";
import { getPaymentOrderForUser } from "@/lib/payment-fulfillment";
import { formatCurrency } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

export const metadata = {
    title: "Payment status",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function valueOrUndefined(value: string | string[] | undefined) {
    return typeof value === "string" && value.length <= 100 ? value : undefined;
}

/**
 * The status page never trusts `?order_id` as proof of payment. It looks the
 * order up for the signed-in user and renders whatever the database says; the
 * plan is only granted by the verified API/webhook path.
 */
export default async function PaymentSuccessPage({
    searchParams,
}: {
    searchParams: Promise<{ order_id?: string | string[] }>;
}) {
    const { userId } = await auth();
    if (!userId) redirect("/auth/sign-in");

    const params = await searchParams;
    const orderId = valueOrUndefined(params.order_id);
    const record = orderId
        ? await getPaymentOrderForUser(userId, orderId)
        : null;

    const paid = record?.order.status === "paid";
    const subscription = paid
        ? (
              await db
                  .select({
                      currentPeriodEnd: app_subscriptions.currentPeriodEnd,
                  })
                  .from(app_subscriptions)
                  .where(eq(app_subscriptions.userId, userId))
                  .limit(1)
          )[0]
        : undefined;

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-10">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {paid ? (
                            <CheckCircle2
                                className="h-6 w-6 text-primary"
                                aria-hidden="true"
                            />
                        ) : (
                            <Clock3
                                className="h-6 w-6 text-muted-foreground"
                                aria-hidden="true"
                            />
                        )}
                        {paid ? "Payment confirmed" : "Confirming your payment"}
                    </CardTitle>
                    <CardDescription>
                        {paid
                            ? "Your plan is active and the payment has been recorded."
                            : "We have not received the verified payment yet. If money left your account, it will appear here once Razorpay confirms it."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {record ? (
                        <dl className="grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-muted-foreground">Plan</dt>
                                <dd className="mt-1 font-medium">
                                    {record.planName}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Amount</dt>
                                <dd className="mt-1 font-medium">
                                    {formatCurrency(
                                        Number(record.order.amount),
                                        record.order.currency,
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Status</dt>
                                <dd className="mt-1 font-medium capitalize">
                                    {paid ? "Paid" : record.order.status}
                                </dd>
                            </div>
                            {paid && subscription ? (
                                <div>
                                    <dt className="text-muted-foreground">
                                        Current period ends
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {format(
                                            subscription.currentPeriodEnd,
                                            "d MMM yyyy",
                                        )}
                                    </dd>
                                </div>
                            ) : null}
                            {record.order.providerPaymentId ? (
                                <div className="sm:col-span-2">
                                    <dt className="text-muted-foreground">
                                        Payment reference
                                    </dt>
                                    <dd className="mt-1 break-all font-mono text-xs">
                                        {record.order.providerPaymentId}
                                    </dd>
                                </div>
                            ) : null}
                        </dl>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            We could not find that payment for your account. If
                            you were charged, contact support with the payment
                            reference from Razorpay.
                        </p>
                    )}

                    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                        {paid ? (
                            <>
                                <Button asChild>
                                    <Link href="/billing">View billing</Link>
                                </Button>
                                <Button variant="outline" asChild>
                                    <Link href="/dashboard">Go to dashboard</Link>
                                </Button>
                            </>
                        ) : (
                            <>
                                {orderId ? (
                                    <Button asChild>
                                        <Link
                                            href={`/billing/success?order_id=${encodeURIComponent(
                                                orderId,
                                            )}`}
                                        >
                                            Check again
                                        </Link>
                                    </Button>
                                ) : null}
                                <Button variant="outline" asChild>
                                    <Link href="/billing">Back to billing</Link>
                                </Button>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
