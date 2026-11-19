"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/currencies";
import type {
    CancelReason,
    CancellationPreview,
} from "@/lib/refund-service";

type CancellationSuccess = {
    providerRefundId: string;
    amount: string;
    currency: string;
    status: string;
};

const REASON_LABELS: Record<CancelReason, string> = {
    too_expensive: "Too expensive",
    not_using: "Not using it enough",
    missing_feature: "Missing a feature I need",
    other: "Another reason",
};

export function CancelPlanDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [preview, setPreview] = useState<CancellationPreview | null>(null);
    const [reason, setReason] = useState<CancelReason | "skip">("skip");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<CancellationSuccess | null>(null);

    async function loadPreview() {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/billing/cancellation", {
                cache: "no-store",
            });
            const body = (await response.json()) as
                | CancellationPreview
                | { error?: string };
            if (!response.ok) {
                setError(
                    ("error" in body && body.error) ||
                        "We could not load the refund details.",
                );
                return;
            }
            setPreview(body as CancellationPreview);
        } catch {
            setError("We could not load the refund details.");
        } finally {
            setLoading(false);
        }
    }

    async function onOpenChange(next: boolean) {
        setOpen(next);
        // Re-render the billing page only after the confirmation is dismissed.
        // Doing it on success unmounted this dialog (the page stops rendering it
        // once the plan is canceled) and the refund reference vanished (R-06).
        if (!next && success) {
            // The cancel route returns as soon as the refund row is written,
            // but the refund webhook may still be settling it. Poll the billing
            // state so the page re-renders only once the server has caught up,
            // instead of refreshing while the refund is still pending.
            for (let attempt = 0; attempt < 5; attempt++) {
                const response = await fetch("/api/billing/cancellation", {
                    cache: "no-store",
                });
                const body = (await response.json()) as
                    | CancellationPreview
                    | { error?: string };
                if (response.ok) {
                    const state = body as CancellationPreview;
                    if (
                        state.planName !== undefined &&
                        !state.eligible
                    ) {
                        break;
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            router.refresh();
        }
        if (next) {
            setSuccess(null);
            setPreview(null);
            setReason("skip");
            void loadPreview();
        }
    }

    async function cancel() {
        if (!preview?.eligible) return;
        setSubmitting(true);
        setError(null);
        try {
            const response = await fetch("/api/billing/cancellation", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    expectedRefund: preview.refundAmount,
                    ...(reason === "skip" ? {} : { reason }),
                }),
            });
            const body = (await response.json()) as CancellationSuccess & {
                error?: string;
                preview?: CancellationPreview;
            };
            if (!response.ok) {
                if (response.status === 409 && body.preview) {
                    setPreview(body.preview);
                }
                setError(body.error || "The cancellation could not be completed.");
                return;
            }
            setSuccess(body);
        } catch {
            setError("The cancellation could not be completed. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
                Cancel plan
            </Button>

            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {success ? "Plan canceled" : "Cancel plan"}
                        </DialogTitle>
                        <DialogDescription>
                            {success
                                ? "Your plan has ended and your account is on the Free plan."
                                : "Cancelling ends your plan immediately. Any refund is based on the unused part of the current billing period."}
                        </DialogDescription>
                    </DialogHeader>

                    {success ? (
                        <div className="flex flex-col gap-3 text-sm">
                            <p role="status" className="font-medium">
                                Refund{" "}
                                {formatCurrency(
                                    Number(success.amount),
                                    success.currency,
                                )}{" "}
                                started.
                            </p>
                            <p className="text-muted-foreground">
                                Refunds are processed by Razorpay and normally
                                arrive in 5–7 working days.
                            </p>
                            <p className="text-muted-foreground">
                                Reference:{" "}
                                <span className="font-mono text-xs">
                                    {success.providerRefundId}
                                </span>
                            </p>
                        </div>
                    ) : loading ? (
                        <p role="status" className="flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Loading refund details…
                        </p>
                    ) : preview ? (
                        <div className="flex flex-col gap-4 text-sm">
                            <dl className="grid grid-cols-2 gap-3">
                                <div>
                                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Plan
                                    </dt>
                                    <dd className="font-medium">
                                        {preview.planName ?? "Paid plan"}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Refund
                                    </dt>
                                    <dd className="font-medium">
                                        {preview.eligible
                                            ? formatCurrency(
                                                  Number(preview.refundAmount),
                                                  preview.currency,
                                              )
                                            : "Not available"}
                                    </dd>
                                </div>
                            </dl>

                            {preview.eligible ? (
                                <>
                                    <p>{preview.explanation}</p>
                                    <p className="text-muted-foreground">
                                        You move to Free immediately. Existing
                                        records and tracked subscriptions stay,
                                        but you cannot add more above the Free
                                        limit. Your plan would have ended on{" "}
                                        {preview.periodEnd
                                            ? new Date(
                                                  preview.periodEnd,
                                              ).toLocaleDateString()
                                            : "its normal date"}
                                        .
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="cancel-reason">
                                            Reason (optional)
                                        </Label>
                                        <Select
                                            value={reason}
                                            onValueChange={(value) =>
                                                setReason(value as CancelReason | "skip")
                                            }
                                        >
                                            <SelectTrigger
                                                id="cancel-reason"
                                                className="w-full"
                                            >
                                                <SelectValue placeholder="Prefer not to say" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="skip">
                                                    Prefer not to say
                                                </SelectItem>
                                                {Object.entries(REASON_LABELS).map(
                                                    ([value, label]) => (
                                                        <SelectItem
                                                            key={value}
                                                            value={value}
                                                        >
                                                            {label}
                                                        </SelectItem>
                                                    ),
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </>
                            ) : (
                                <p className="text-muted-foreground">
                                    {preview.reason ??
                                        "This plan cannot be refunded."}
                                </p>
                            )}
                        </div>
                    ) : null}

                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            {success ? "Done" : "Keep plan"}
                        </Button>
                        {!success && preview?.eligible && (
                            <Button
                                onClick={cancel}
                                disabled={submitting || loading}
                            >
                                {submitting && (
                                    <Loader2
                                        className="me-2 h-4 w-4 animate-spin"
                                        aria-hidden="true"
                                    />
                                )}
                                Cancel and refund{" "}
                                {formatCurrency(
                                    Number(preview.refundAmount),
                                    preview.currency,
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
