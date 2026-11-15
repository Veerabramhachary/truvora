import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Server-only Razorpay helpers.
 *
 * The key secret never leaves the server. The only value the browser receives
 * is `keyId` (Razorpay's publishable key). Amounts are always recomputed from
 * the `plans` table — never from a request body or query string.
 */

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const REQUEST_TIMEOUT_MS = 10_000;

export type RazorpayConfig = {
    keyId: string;
    keySecret: string;
    webhookSecret: string | null;
};

export type RazorpayOrder = {
    id: string;
    amount: number;
    currency: string;
    receipt: string | null;
    status: string;
};

export type RazorpayPayment = {
    id: string;
    order_id: string | null;
    amount: number;
    currency: string;
    status: string;
    method?: string | null;
};

export type RazorpayRefund = {
    id: string;
    payment_id: string;
    amount: number;
    currency: string;
    status: string;
    speed_requested?: string | null;
    notes?: Record<string, string> | unknown[] | null;
};

export class RazorpayError extends Error {
    readonly status: number | null;
    /** Provider error code only. The raw provider body never leaves the server. */
    readonly code: string | null;
    /** Network/timeout/5xx/429/409-in-progress: the same request is safe to retry. */
    readonly retryable: boolean;

    constructor(
        message: string,
        status: number | null = null,
        options: { code?: string | null; retryable?: boolean } = {},
    ) {
        super(message);
        this.name = "RazorpayError";
        this.status = status;
        this.code = options.code ?? null;
        this.retryable = options.retryable ?? false;
    }
}

/** Returns null when checkout is not configured. Checkout must fail closed. */
export function getRazorpayConfig(): RazorpayConfig | null {
    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!keyId || !keySecret) return null;

    return {
        keyId,
        keySecret,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null,
    };
}

export function isRazorpayConfigured(): boolean {
    return getRazorpayConfig() !== null;
}

export function isRazorpayWebhookConfigured(): boolean {
    return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim());
}

function safeHexEqual(expectedHex: string, receivedHex: string): boolean {
    const received = receivedHex.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(received)) return false;

    const expectedBuffer = Buffer.from(expectedHex, "hex");
    const receivedBuffer = Buffer.from(received, "hex");
    if (expectedBuffer.length !== receivedBuffer.length) return false;

    return timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Razorpay signs `order_id|payment_id` with the key secret. This is the
 * browser-facing return path; the webhook uses a separate secret.
 */
export function verifyRazorpayPaymentSignature(params: {
    orderId: string;
    paymentId: string;
    signature: string;
    secret: string;
}): boolean {
    const expected = createHmac("sha256", params.secret)
        .update(`${params.orderId}|${params.paymentId}`)
        .digest("hex");
    return safeHexEqual(expected, params.signature);
}

/** Razorpay signs the exact raw webhook body, never re-serialised JSON. */
export function verifyRazorpayWebhookSignature(params: {
    rawBody: string;
    signature: string;
    secret: string;
}): boolean {
    const expected = createHmac("sha256", params.secret)
        .update(params.rawBody)
        .digest("hex");
    return safeHexEqual(expected, params.signature);
}

async function razorpayRequest<T>(
    path: string,
    config: RazorpayConfig,
    init: RequestInit = {},
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
            ...init,
            headers: {
                Authorization: `Basic ${Buffer.from(
                    `${config.keyId}:${config.keySecret}`,
                ).toString("base64")}`,
                "Content-Type": "application/json",
                ...(init.headers ?? {}),
            },
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        // Timeouts and connection resets are safe to retry: Razorpay either
        // ignored the request or the idempotency key makes the retry a no-op.
        console.error("[razorpay] API request failed:", {
            path,
            network: error instanceof Error ? error.name : "unknown",
        });
        throw new RazorpayError("Payment provider request failed", null, {
            retryable: true,
        });
    }

    if (!response.ok) {
        // Log provider diagnostics server-side only. Never return the raw body
        // to the client: it can contain account or payment metadata.
        let providerCode: string | undefined;
        let description: string | undefined;
        try {
            const payload = (await response.json()) as {
                error?: { code?: string; description?: string };
            };
            providerCode = payload.error?.code;
            description = payload.error?.description;
            console.error("[razorpay] API request failed:", {
                path,
                status: response.status,
                code: providerCode,
                description,
            });
        } catch {
            console.error("[razorpay] API request failed:", {
                path,
                status: response.status,
            });
        }
        const retryable =
            response.status >= 500 ||
            response.status === 429 ||
            // 409 means another request with this idempotency key is still in
            // progress; Razorpay answers 400 when the same key is reused with
            // a different body.
            response.status === 409;
        throw new RazorpayError("Payment provider request failed", response.status, {
            code: providerCode ?? null,
            retryable,
        });
    }

    return (await response.json()) as T;
}

export async function createRazorpayOrder(
    params: {
        amountPaise: number;
        receipt: string;
        notes?: Record<string, string>;
    },
    config: RazorpayConfig,
): Promise<RazorpayOrder> {
    return razorpayRequest<RazorpayOrder>("/orders", config, {
        method: "POST",
        body: JSON.stringify({
            amount: params.amountPaise,
            currency: "INR",
            receipt: params.receipt,
            notes: params.notes ?? {},
        }),
    });
}

export async function fetchRazorpayPayment(
    paymentId: string,
    config: RazorpayConfig,
): Promise<RazorpayPayment> {
    return razorpayRequest<RazorpayPayment>(
        `/payments/${encodeURIComponent(paymentId)}`,
        config,
    );
}

/**
 * Some Razorpay accounts do not auto-capture. Capturing explicitly means the
 * verify route can finish a real payment instead of leaving it authorized.
 */
export async function captureRazorpayPayment(
    paymentId: string,
    amountPaise: number,
    config: RazorpayConfig,
): Promise<RazorpayPayment> {
    return razorpayRequest<RazorpayPayment>(
        `/payments/${encodeURIComponent(paymentId)}/capture`,
        config,
        {
            method: "POST",
            body: JSON.stringify({ amount: amountPaise, currency: "INR" }),
        },
    );
}

/**
 * Refunds only work on captured payments; a normal refund takes 5–7 working
 * days and Razorpay rejects payments older than 6 months. The idempotency key
 * must be 10+ characters of letters, digits, `-` or `_` and must reuse the same
 * body on retry, otherwise Razorpay answers 400/409.
 */
export async function createRazorpayRefund(
    params: {
        paymentId: string;
        amountPaise: number;
        idempotencyKey: string;
        notes?: Record<string, string>;
        speed?: "normal" | "optimum";
    },
    config: RazorpayConfig,
): Promise<RazorpayRefund> {
    return razorpayRequest<RazorpayRefund>(
        `/payments/${encodeURIComponent(params.paymentId)}/refund`,
        config,
        {
            method: "POST",
            headers: { "X-Refund-Idempotency": params.idempotencyKey },
            body: JSON.stringify({
                amount: params.amountPaise,
                speed: params.speed ?? "normal",
                notes: params.notes ?? {},
            }),
        },
    );
}

export async function fetchRazorpayRefund(
    refundId: string,
    config: RazorpayConfig,
): Promise<RazorpayRefund> {
    return razorpayRequest<RazorpayRefund>(
        `/refunds/${encodeURIComponent(refundId)}`,
        config,
    );
}

export async function fetchRazorpayPaymentRefunds(
    paymentId: string,
    config: RazorpayConfig,
): Promise<{ entity: RazorpayRefund[]; count: number }> {
    return razorpayRequest<{ entity: RazorpayRefund[]; count: number }>(
        `/payments/${encodeURIComponent(paymentId)}/refunds`,
        config,
    );
}

/** Receipts are capped at 40 characters by Razorpay. */
export function buildRazorpayReceipt(): string {
    return `trv_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}
