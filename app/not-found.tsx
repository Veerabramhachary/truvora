import Link from "next/link";

export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                404
            </p>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                We couldn&apos;t find that page
            </h1>
            <p className="max-w-md text-base text-muted-foreground">
                The link may be out of date, or the page may have moved. Your
                data is safe — nothing was changed.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                    href="/"
                    className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Back to home
                </Link>
                <Link
                    href="/dashboard"
                    className="rounded-xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                    Go to dashboard
                </Link>
            </div>
        </main>
    );
}
