import { Resend } from "resend";

/**
 * Refund emails. Both functions are best-effort: the money state is already in
 * the database, so an email failure is logged and never fails the caller.
 */
function getMailer() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RENEWAL_EMAIL_FROM?.trim();
    if (!apiKey || !from) return null;
    return { resend: new Resend(apiKey), from };
}

export async function sendRefundConfirmation(params: {
    email: string | null;
    planName: string;
    amount: string;
    currency: string;
    refundId: string;
}) {
    const mailer = getMailer();
    if (!mailer || !params.email) {
        console.error(
            "[refunds] Refund confirmation not sent; email is not configured:",
            params.refundId,
        );
        return;
    }

    try {
        const result = await mailer.resend.emails.send(
            {
                from: mailer.from,
                to: params.email,
                subject: "Your Truvora refund is on its way",
                text: [
                    `We have started a refund of ${params.amount} ${params.currency} for your ${params.planName} plan.`,
                    "",
                    "Your plan has ended and your account is on the Free plan.",
                    "Refunds are processed by Razorpay and normally arrive in 5-7 working days.",
                    "",
                    `Reference: ${params.refundId}`,
                ].join("\n"),
            },
            { idempotencyKey: `refund/${params.refundId}` },
        );
        if (result.error) throw new Error(result.error.name);
    } catch (error) {
        console.error("[refunds] Could not send refund confirmation:", error);
    }
}

export async function sendRefundFailureAlert(refundId: string) {
    const mailer = getMailer();
    const to =
        process.env.SUPPORT_EMAIL?.trim() ||
        process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
    if (!mailer || !to) {
        console.error(
            "[refunds] Refund failed; support email is not configured:",
            refundId,
        );
        return;
    }

    try {
        const result = await mailer.resend.emails.send(
            {
                from: mailer.from,
                to,
                subject: "Truvora refund failed",
                text: `Razorpay reported a failed refund.\n\nRefund: ${refundId}\n\nCheck the payment in the Razorpay dashboard before retrying.`,
            },
            { idempotencyKey: `refund-failed/${refundId}` },
        );
        if (result.error) throw new Error(result.error.name);
    } catch (error) {
        console.error("[refunds] Could not send refund failure alert:", error);
    }
}
