// app/[locale]/(marketing)/pricing/PricingSkeleton.tsx
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PricingSkeleton() {
    return (
        <div className="w-full max-w-7xl mx-auto px-4">
            <div className="flex justify-center mb-8">
                <Skeleton className="h-10 w-[200px]" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <Card key={i} className="flex flex-col">
                        <CardHeader>
                            <Skeleton className="h-8 w-3/4 mb-2" />
                            <Skeleton className="h-4 w-full" />
                        </CardHeader>
                        <CardContent className="flex-1">
                            <Skeleton className="h-10 w-1/2 mb-4" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-3/4" />
                        </CardContent>
                        <CardFooter>
                            <Skeleton className="h-10 w-full" />
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    );
}
