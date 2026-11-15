/**
 * Refund policy (§4.2/§4.3). Pure and deterministic so the amount shown in the
 * dialog, the amount sent to Razorpay and the copy in Terms all come from the
 * same rules.
 *
 * All money is BigInt paise. Never use floating point for the refund amount.
 */
import { toPaise } from "@/lib/money";

export const FULL_REFUND_WINDOW_DAYS = 7;
export const REFUND_COOLDOWN_DAYS = 90;
/** Razorpay rejects normal refunds after 6 months; keep a safety margin. */
export const MAX_PAYMENT_AGE_DAYS = 170;
export const MIN_REFUND_PAISE = BigInt(1000);

const DAY_MS = 24 * 60 * 60 * 1000;

export type RefundPolicyFailure =
    | "not_paid"
    | "nothing_left"
    | "missing_period"
    | "period_ended"
    | "payment_too_old"
    | "cooldown"
    | "below_minimum";

export type RefundPolicyResult = {
    eligible: boolean;
    amountPaise: bigint;
    kind: "full_window" | "prorated" | null;
    daysSincePayment: number;
    unusedDays: number;
    totalDays: number;
    reason: RefundPolicyFailure | null;
};

function emptyResult(
    reason: RefundPolicyFailure,
    overrides: Partial<RefundPolicyResult> = {},
): RefundPolicyResult {
    return {
        eligible: false,
        amountPaise: BigInt(0),
        kind: null,
        daysSincePayment: 0,
        unusedDays: 0,
        totalDays: 0,
        reason,
        ...overrides,
    };
}

export function calculateRefund(params: {
    amountPaid: string;
    amountRefunded: string;
    paidAt: Date | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    now: Date;
    lastRefundAt?: Date | null;
}): RefundPolicyResult {
    const paidPaise = toPaise(params.amountPaid);
    const refundedPaise = toPaise(params.amountRefunded);
    const refundablePaise = paidPaise - refundedPaise;

    if (paidPaise <= BigInt(0)) {
        return emptyResult("not_paid");
    }
    if (refundablePaise <= BigInt(0)) {
        return emptyResult("nothing_left");
    }
    if (!params.periodStart || !params.periodEnd || !params.paidAt) {
        return emptyResult("missing_period");
    }

    const daysSincePayment = Math.floor(
        (params.now.getTime() - params.paidAt.getTime()) / DAY_MS,
    );
    const totalDays = Math.max(
        1,
        Math.round(
            (params.periodEnd.getTime() - params.periodStart.getTime()) / DAY_MS,
        ),
    );
    const unusedDays = Math.min(
        totalDays,
        Math.max(
            0,
            Math.floor((params.periodEnd.getTime() - params.now.getTime()) / DAY_MS),
        ),
    );

    if (params.now.getTime() >= params.periodEnd.getTime()) {
        return emptyResult("period_ended", {
            daysSincePayment,
            totalDays,
        });
    }
    if (daysSincePayment > MAX_PAYMENT_AGE_DAYS) {
        return emptyResult("payment_too_old", {
            daysSincePayment,
            unusedDays,
            totalDays,
        });
    }
    if (
        params.lastRefundAt &&
        params.now.getTime() - params.lastRefundAt.getTime() <
            REFUND_COOLDOWN_DAYS * DAY_MS
    ) {
        return emptyResult("cooldown", {
            daysSincePayment,
            unusedDays,
            totalDays,
        });
    }

    const fullWindow =
        params.now.getTime() - params.paidAt.getTime() <=
        FULL_REFUND_WINDOW_DAYS * DAY_MS;
    const amountPaise = fullWindow
        ? refundablePaise
        : (paidPaise * BigInt(unusedDays)) / BigInt(totalDays);
    const cappedPaise =
        amountPaise > refundablePaise ? refundablePaise : amountPaise;

    if (cappedPaise < MIN_REFUND_PAISE) {
        return emptyResult("below_minimum", {
            amountPaise: cappedPaise,
            kind: fullWindow ? "full_window" : "prorated",
            daysSincePayment,
            unusedDays,
            totalDays,
        });
    }

    return {
        eligible: true,
        amountPaise: cappedPaise,
        kind: fullWindow ? "full_window" : "prorated",
        daysSincePayment,
        unusedDays,
        totalDays,
        reason: null,
    };
}
