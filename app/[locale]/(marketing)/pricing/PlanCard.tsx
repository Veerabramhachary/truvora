// app/[locale]/pricing/PlanCard.tsx
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2 } from "lucide-react";
import type { Plan } from "@/types";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

interface PlanCardProps {
    plan: Plan;
    interval: "month" | "year";
}

export function PlanCard({ plan, interval }: PlanCardProps) {
    const {locale} = useParams< {locale: string}>();
    const t = useTranslations();

    const formattedPrice = new Intl.NumberFormat(locale ?? "en-US", {
        style: "currency",
        currency: plan.currency,
        minimumFractionDigits: 2,
    }).format(plan.price);

    return (
        <Card className="flex flex-col w-full max-w-sm hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col flex-1">
                <div className="mb-4">
                    <span className="text-4xl font-bold">{formattedPrice}</span>
                    <span className="text-lg text-muted-foreground ml-1">
                        /{interval === "month" ? "mo" : "yr"}
                    </span>
                </div>

                <Separator className="my-4" />

                <ul className="space-y-3 flex-1">
                    {plan.features.map((feature:string, index) => (
                        <li key={index} className="flex items-start gap-2">
                            <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">
                                {feature}
                            </span>
                        </li>
                    ))}
                </ul>
            </CardContent>

            <CardFooter>
                <Button className="w-full" size="lg" asChild>
                    <Link href={`/checkout/${plan.id}`}>
                    {t('pricing.getStarted')}
                </Link>
                </Button>
            </CardFooter>
        </Card>
    );
}
