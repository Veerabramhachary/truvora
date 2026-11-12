"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPaise } from "@/lib/money";

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
    skipRazorpay?: boolean;
    discountApplied?: boolean;
    discountAmount?: string;
    originalAmount?: string;
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
    discountApplied = false,
    discountAmount = 0,
    originalAmount = 0,
    skipDiscount = false,
}: {
    planId: string;
    planName: string;
    discountApplied?: boolean;
    discountAmount?: number;
    originalAmount?: number;
    skipDiscount?: boolean;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [priceMismatch, setPriceMismatch] = useState<{
      previewed: number;
      server: number;
    } | null>(null);
    const [pendingOrder, setPendingOrder] = useState<OrderResponse | null>(null);

    const discountedAmount = discountApplied && !skipDiscount ? discountAmount : 0;
    const amountToCharge = originalAmount - discountedAmount;

    function clearDiscount() {
        const params = new URLSearchParams(searchParams.toString());
        params.set("skipDiscount", "true");
        router.replace(`${pathname}?${params.toString()}`);
    }

    async function openRazorpayCheckout(order: OrderResponse) {
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
    }

    async function confirmPriceChange() {
        if (!pendingOrder) return;
        setProcessing(true);
        setPriceMismatch(null);
        try {
            await openRazorpayCheckout(pendingOrder);
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "Could not open checkout. Please try again.",
            );
            setProcessing(false);
        }
    }

    async function startCheckout() {
        setError(null);
        setProcessing(true);
        setPriceMismatch(null);

        try {
            const orderResponse = await fetch("/api/payments/razorpay/order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId, applyDiscount: !skipDiscount }),
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

            // Fully comped (₹0) checkout: the server already fulfilled the
            // order and granted the plan. No Razorpay modal needed.
            if (order.skipRazorpay) {
                router.replace(
                    `/billing/success?order_id=${encodeURIComponent(
                        order.orderId,
                    )}`,
                );
                setProcessing(false);
                return;
            }

            // If the server charged a different amount than the preview
            // (discount became stale between page load and order creation),
            // require the user to confirm the new amount before opening
            // Razorpay. Preserve existing behavior when amounts match.
            const expectedPaise = toPaise(amountToCharge.toFixed(2));
            if (BigInt(order.amount) !== expectedPaise) {
                setPendingOrder(order);
                setPriceMismatch({
                    previewed: amountToCharge,
                    server: Number(order.amount) / 100,
                });
                setProcessing(false);
                return;
            }

            await openRazorpayCheckout(order);
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
            {discountApplied && originalAmount > 0 && !skipDiscount ? (
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted border border-border/50">
                    <span className="text-xs text-muted-foreground line-through">
                        Pay ₹{originalAmount.toFixed(2)}
                    </span>
                    <span className="text-xs font-medium text-green-foreground">
                        Pay ₹{amountToCharge.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        -₹{discountedAmount.toFixed(2)}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={clearDiscount}
                        className="text-xs px-2 py-0.5"
                    >
                        {"Don't apply discount"}
                    </Button>
                </div>
            ) : null}
            {priceMismatch ? (
                <div className="flex flex-col gap-2 px-2 py-2 rounded bg-warning border border-warning/50">
                    <p className="text-xs text-warning-foreground font-medium">
                        Price changed
                    </p>
                    <p className="text-xs text-muted-foreground">
                        The amount changed from{" "}
                        <span className="font-medium line-through">
                            ₹{priceMismatch.previewed.toFixed(2)}
                        </span>{" "}
                        to{" "}
                        <span className="font-medium">
                            ₹{priceMismatch.server.toFixed(2)}
                        </span>
                        . Confirm to continue.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setPriceMismatch(null);
                                setPendingOrder(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={confirmPriceChange}
                            disabled={processing}
                        >
                            Confirm ₹{priceMismatch.server.toFixed(2)}
                        </Button>
                    </div>
                </div>
            ) : null}
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
