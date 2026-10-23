"use client";

/*
  Last-resort boundary: this replaces the root layout, so it has to render its
  own <html> and <body>. Anything it doesn't include (fonts, theme) is gone,
  hence the inline styles — a styled-by-CSS-only fallback here would render as
  an unstyled white page, which is exactly what we're trying to avoid.
*/
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "1.5rem",
                    padding: "1.5rem",
                    textAlign: "center",
                    backgroundColor: "#f8fafc",
                    color: "#0f172a",
                    fontFamily:
                        "ui-sans-serif, system-ui, -apple-system, sans-serif",
                }}
            >
                <h1
                    style={{
                        margin: 0,
                        fontSize: "2.25rem",
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                    }}
                >
                    Truvora hit an unexpected error
                </h1>
                <p
                    style={{
                        margin: 0,
                        maxWidth: "28rem",
                        fontSize: "1rem",
                        lineHeight: 1.6,
                        color: "#475569",
                    }}
                >
                    The app couldn&apos;t recover from that one. Reloading usually
                    sorts it out.
                </p>
                <button
                    type="button"
                    onClick={reset}
                    style={{
                        padding: "0.75rem 1.5rem",
                        borderRadius: "0.75rem",
                        border: "none",
                        backgroundColor: "#4f46e5",
                        color: "#fff",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    Reload
                </button>
                {process.env.NODE_ENV !== "production" && error.digest && (
                    <p
                        style={{
                            margin: 0,
                            fontSize: "0.75rem",
                            color: "#94a3b8",
                        }}
                    >
                        Error digest: {error.digest}
                    </p>
                )}
            </body>
        </html>
    );
}
