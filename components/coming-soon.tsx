import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

interface ComingSoonProps {
    icon: LucideIcon;
    title: string;
    description: string;
    /** Bullets describing what the finished version will do. */
    highlights?: string[];
}

/**
 * Placeholder body for routes that exist in the nav but whose screens aren't
 * built yet. Renders a real, readable card instead of a bare `<div>` so the
 * route never looks broken while it is still a stub.
 */
export function ComingSoon({
    icon: Icon,
    title,
    description,
    highlights = [],
}: ComingSoonProps) {
    return (
        <div className="flex w-full items-start justify-center p-6">
            <Card className="w-full max-w-2xl">
                <CardHeader className="space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <Badge variant="secondary">Coming soon</Badge>
                    </div>
                    <CardTitle className="text-2xl">{title}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                        {description}
                    </CardDescription>
                </CardHeader>

                {highlights.length > 0 && (
                    <CardContent>
                        <ul className="grid gap-2 text-sm text-muted-foreground">
                            {highlights.map((highlight) => (
                                <li
                                    key={highlight}
                                    className="flex items-start gap-2"
                                >
                                    <span
                                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60"
                                        aria-hidden="true"
                                    />
                                    {highlight}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
