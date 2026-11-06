"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

type RazorpayCheckoutResponse = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
};

type RazorpayFailureResponse = {
    error?: {
        description?: string;
        reason?: string;
    };
};

type RazorpayOptions = {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    order_id: string;
    prefill?: { name?: string; email?: string };
    handler: (response: RazorpayCheckoutResponse) => void;
    modal?: { ondismiss?: () => void };
    theme?: { color?: string };
};

type RazorpayInstance = {
    open: () => void;
    on: (
        event: "payment.failed",
        handler: (response: RazorpayFailureResponse) => void,
    ) => void;
};

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
    interface Window {
        Razorpay?: RazorpayConstructor;
    }
}

type OrderResponse = {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    planName: string;
    planInterval: "month" | "year";
    planIntervalCount: number;
    prefill?: { name?: string; email?: string };
    error?: string;
};

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Checkout is only available in a browser."));
    }
    if (window.Razorpay) return Promise.resolve();
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = RAZORPAY_SCRIPT;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            scriptPromise = null;
            script.remove();
            reject(new Error("Could not load the secure payment window."));
        };
        document.body.appendChild(script);
    });

    return scriptPromise;
}

async function responseError(response: Response, fallback: string) {
    try {
        const data = (await response.json()) as { error?: string };
        return data.error ?? fallback;
    } catch {
        return fallback;
    }
}

export function RazorpayCheckoutButton({
    planId,
    planName,
}: {
    planId: string;
    planName: string;
}) {
    const router = useRouter();
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function startCheckout() {
        setError(null);
        setProcessing(true);

        try {
            const orderResponse = await fetch("/api/payments/razorpay/order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId }),
            });

            if (!orderResponse.ok) {
                throw new Error(
                    await responseError(
                        orderResponse,
                        "Could not start checkout. Please try again.",
                    ),
                );
            }

            const order = (await orderResponse.json()) as OrderResponse;
            await loadRazorpayScript();

            if (!window.Razorpay) {
                throw new Error("Could not load the secure payment window.");
            }

            const checkout = new window.Razorpay({
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: "Truvora",
                description: order.planName,
                order_id: order.orderId,
                prefill: order.prefill,
                handler: (paymentResponse) => {
                    void (async () => {
                        try {
                            const verifyResponse = await fetch(
                                "/api/payments/razorpay/verify",
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        orderId: order.orderId,
                                        paymentId:
                                            paymentResponse.razorpay_payment_id,
                                        signature:
                                            paymentResponse.razorpay_signature,
                                    }),
                                },
                            );

                            if (!verifyResponse.ok) {
                                router.replace(
                                    `/billing/failure?order_id=${encodeURIComponent(
                                        order.orderId,
                                    )}`,
                                );
                                return;
                            }

                            router.replace(
                                `/billing/success?order_id=${encodeURIComponent(
                                    order.orderId,
                                )}`,
                            );
                        } catch {
                            // The webhook will still grant the plan. Send the
                            // user to a status page instead of claiming success
                            // or failure based on a network error.
                            router.replace(
                                `/billing/failure?order_id=${encodeURIComponent(
                                    order.orderId,
                                )}`,
                            );
                        } finally {
                            setProcessing(false);
                        }
                    })();
                },
                modal: {
                    ondismiss: () => setProcessing(false),
                },
                theme: { color: "#4f46e5" },
            });

            checkout.on("payment.failed", (failure) => {
                setError(
                    failure.error?.description ??
                        failure.error?.reason ??
                        "The payment did not go through. Please try again.",
                );
                setProcessing(false);
            });

            checkout.open();
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "Could not start checkout. Please try again.",
            );
            setProcessing(false);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={startCheckout}
                disabled={processing}
                aria-busy={processing}
            >
                {processing ? (
                    <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        Opening secure checkout…
                    </>
                ) : (
                    <>
                        <LockKeyhole aria-hidden="true" />
                        Pay securely for {planName}
                    </>
                )}
            </Button>
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
