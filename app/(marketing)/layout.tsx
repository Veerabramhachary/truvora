import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
                    <Link href="/" className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded bg-indigo-600 flex items-center justify-center">
                            <span className="h-2 w-2 rounded-full bg-white" />
                        </span>
                        <span className="font-semibold text-lg tracking-tighter text-foreground">
                            TRUVORA
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
                        <Link
                            href="/#features"
                            className="transition-colors hover:text-foreground"
                        >
                            Features
                        </Link>
                        <Link
                            href="/#how-it-works"
                            className="transition-colors hover:text-foreground"
                        >
                            How it works
                        </Link>
                        <Link
                            href="/pricing"
                            className="transition-colors hover:text-foreground"
                        >
                            Pricing
                        </Link>
                    </nav>

                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/auth/sign-in">Sign in</Link>
                        </Button>
                        <Button size="sm" asChild>
                            <Link href="/auth/sign-up">Get started</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main>{children}</main>
        </div>
    );
}
