/**
 * Extract a human-readable message from a thrown API error.
 *
 * `@refinedev/simple-rest` builds its rejection object as
 * `{ ...axiosError, message: response.data.message, statusCode }` — it only
 * looks at `data.message`, while our route handlers return `{ error: "..." }`.
 * Read both shapes so the reason actually reaches the toast instead of a
 * generic "Error adding expense".
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === "object") {
        const e = error as {
            message?: unknown;
            response?: { data?: { message?: unknown; error?: unknown } };
        };

        const fromBody = e.response?.data?.message ?? e.response?.data?.error;
        if (typeof fromBody === "string" && fromBody.trim()) {
            return fromBody;
        }

        // Axios/Refine fall back to serialising the whole payload into
        // `message`; don't dump a JSON blob on the user.
        if (
            typeof e.message === "string" &&
            e.message.trim() &&
            !e.message.trim().startsWith("{") &&
            !e.message.trim().startsWith("<")
        ) {
            return e.message;
        }
    }
    return fallback;
}

/**
 * Extract a readable message from a Clerk SDK error.
 *
 * Clerk rejects with a plain object shaped `{ errors: [{ message, longMessage,
 * code }] }` rather than an `Error`, so `error.message` is usually undefined and
 * the raw fallback leaks through. Prefer `longMessage` (it explains the fix,
 * e.g. "password is incorrect" vs a bare code), then `message`.
 */
export function clerkErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === "object") {
        const first = (
            error as { errors?: Array<{ message?: string; longMessage?: string }> }
        ).errors?.[0];

        if (typeof first?.longMessage === "string" && first.longMessage.trim()) {
            return first.longMessage;
        }
        if (typeof first?.message === "string" && first.message.trim()) {
            return first.message;
        }
    }
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}
