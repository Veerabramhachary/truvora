"use client";

import { useEffect } from "react";

interface ErrorPageProps {
    error: Error & { digest?: string };
    reset: () => void;
}

/**
 * Route-level error boundary. Without one, a thrown error during render
 * bubbles to the root and Next falls back to a bare white page with no way
 * back — this keeps the user inside the app and gives them a retry.
 */
export default function Error({ error, reset }: ErrorPageProps) {
    useEffect(() => {
        // Surfaced to the console (and to any configured error tracker) rather
        // than rendered, so internals never reach the UI.
        console.error(error);
    }, [error]);

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
            <h1 className="max-w-xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Something went wrong
            </h1>
            <p className="max-w-md text-base text-muted-foreground">
                An unexpected error occurred while loading this page. Your data
                hasn&apos;t been lost — try again and it should pick up where it
                left off.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Try again
                </button>
                <a
                    href="/dashboard"
                    className="rounded-xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                    Go to dashboard
                </a>
            </div>

            {process.env.NODE_ENV !== "production" && error.digest && (
                <p className="mt-4 font-mono text-xs text-muted-foreground">
                    Error digest: {error.digest}
                </p>
            )}
        </main>
    );
}
