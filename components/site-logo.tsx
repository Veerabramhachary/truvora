import Link from "next/link";
import { cn } from "@/lib/utils";

type SiteLogoProps = {
    className?: string;
};

export function SiteLogo({ className }: SiteLogoProps) {
    return (
        <Link href="/" className={cn("flex items-center gap-2", className)}>
            <span className="flex h-6 w-6 items-center justify-center rounded bg-indigo-600">
                <span className="h-2 w-2 rounded-full bg-white" />
            </span>
            <span className="text-lg font-semibold tracking-tighter">TRUVORA</span>
        </Link>
    );
}
