
export default function Loading() {
    return (
        <div className="min-h-screen bg-background">
            {/* Indeterminate progress bar. Needs overflow-hidden + a narrower
                bar, otherwise the translateX sweep has nowhere to go and the
                element just sits full-width. */}
            <div className="fixed top-0 left-0 z-50 h-1 w-full overflow-hidden bg-primary/15">
                <div className="h-full w-1/3 animate-progress bg-primary" />
            </div>

            {/* Main content skeleton */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header skeleton */}
                <div className="mb-8">
                    <div className="h-8 w-64 animate-pulse rounded bg-muted" />
                    <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
                </div>

                {/* Stats cards skeleton */}
                <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="rounded-lg bg-card p-6 shadow">
                            <div className="mb-4 h-4 w-24 animate-pulse rounded bg-muted" />
                            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>

                {/* Main content area skeleton */}
                <div className="rounded-lg bg-card p-6 shadow">
                    <div className="mb-4 h-6 w-48 animate-pulse rounded bg-muted" />
                    <div className="space-y-3">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    </div>

                    {/* Table-like skeleton */}
                    <div className="mt-6">
                        <div className="mb-2 h-10 w-full animate-pulse rounded bg-muted" />
                        <div className="mb-2 h-10 w-full animate-pulse rounded bg-muted" />
                        <div className="h-10 w-full animate-pulse rounded bg-muted" />
                    </div>
                </div>
            </div>
        </div>
    );
}
