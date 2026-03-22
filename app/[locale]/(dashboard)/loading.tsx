
export default function Loading() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Progress bar - animates continuously */}
            <div className="fixed top-0 left-0 w-full h-1 z-50">
                <div className="h-full bg-blue-600 animate-progress" />
            </div>

            {/* Main content skeleton */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header skeleton */}
                <div className="mb-8">
                    <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="mt-2 h-4 w-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>

                {/* Stats cards skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {[...Array(3)].map((_, i) => (
                        <div
                            key={i}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
                        >
                            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
                            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </div>
                    ))}
                </div>

                {/* Main content area skeleton */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
                    <div className="space-y-3">
                        <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        <div className="h-4 w-4/6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>

                    {/* Table-like skeleton */}
                    <div className="mt-6">
                        <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
                        <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
                        <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                </div>
            </div>
        </div>
    );
}
