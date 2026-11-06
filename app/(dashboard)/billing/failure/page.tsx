import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getPaymentOrderForUser } from "@/lib/payment-fulfillment";
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
 * Failure is a display state, not a database write. The same page is used
 * when the browser closed mid-payment; the order may already be paid and the
 * webhook may still arrive, so the payment is looked up before saying
 * anything definitive.
 */
export default async function PaymentFailurePage({
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
                            <AlertTriangle
                                className="h-6 w-6 text-destructive"
                                aria-hidden="true"
                            />
                        )}
                        {paid
                            ? "This payment actually went through"
                            : "Payment not completed"}
                    </CardTitle>
                    <CardDescription>
                        {paid
                            ? "Razorpay confirmed the payment, so your plan is active. You can continue to billing."
                            : "No verified payment was recorded. You have not been charged by Truvora, and your current plan is unchanged."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {!paid && record?.order.status === "failed" ? (
                        <p className="text-sm text-muted-foreground">
                            The payment attempt was declined or cancelled. You
                            can try again with a different payment method.
                        </p>
                    ) : null}
                    {!paid && !record ? (
                        <p className="text-sm text-muted-foreground">
                            We could not find that payment for your account. If
                            money left your account, check the Razorpay receipt
                            and contact support.
                        </p>
                    ) : null}
                    {!paid && record ? (
                        <p className="text-sm text-muted-foreground">
                            If you completed the payment, it can take a moment
                            to appear. The status will update automatically once
                            Razorpay&apos;s signed confirmation arrives.
                        </p>
                    ) : null}

                    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                        {paid ? (
                            <Button asChild>
                                <Link
                                    href={`/billing/success?order_id=${encodeURIComponent(
                                        record?.order.providerOrderId ?? "",
                                    )}`}
                                >
                                    View payment status
                                </Link>
                            </Button>
                        ) : record ? (
                            <Button asChild>
                                <Link
                                    href={`/billing/checkout/${record.order.planId}`}
                                >
                                    Try again
                                </Link>
                            </Button>
                        ) : null}
                        <Button variant="outline" asChild>
                            <Link href="/billing">Back to billing</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
