"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Layers, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setActiveLedgerId } from "@/lib/ledger-client";

type Intent = "personal" | "business" | "both";
type Step = "usage" | "business" | "done";

const OPTIONS: { value: Intent; title: string; text: string; icon: typeof User }[] = [
    { value: "personal", title: "Personal", text: "My own income, spending and subscriptions.", icon: User },
    { value: "business", title: "Business", text: "My small business's income, costs and recurring payments.", icon: Briefcase },
    { value: "both", title: "Both", text: "Keep personal and business records, completely separate.", icon: Layers },
];

export default function OnboardingWizard() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("usage");
    const [intent, setIntent] = useState<Intent>("personal");
    const [businessName, setBusinessName] = useState("");
    const [saving, setSaving] = useState(false);

    async function finish(body: { intent: Intent | "skip"; businessName?: string }) {
        if (saving) return;
        setSaving(true);
        try {
            const response = await fetch("/api/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const result = (await response.json().catch(() => ({}))) as {
                activeLedgerId?: string | null;
                error?: string;
            };
            if (!response.ok) throw new Error(result.error ?? "Could not finish setup");

            // "Business" starts in the business ledger; the dashboard reads this.
            if (result.activeLedgerId) setActiveLedgerId(result.activeLedgerId);
            if (body.intent === "skip") {
                router.push("/dashboard");
                return;
            }
            setStep("done");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not finish setup");
        } finally {
            setSaving(false);
        }
    }

    function handleUsageContinue() {
        if (intent === "personal") void finish({ intent });
        else setStep("business");
    }

    function handleBusinessSubmit(event: FormEvent) {
        event.preventDefault();
        const name = businessName.trim();
        if (!name) return;
        void finish({ intent, businessName: name });
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-lg">
                {step === "usage" && (
                    <>
                        <CardHeader>
                            <CardTitle>Welcome to Truvora</CardTitle>
                            <CardDescription>How will you use it? You can change this later.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div role="radiogroup" aria-label="How will you use Truvora" className="grid gap-3">
                                {OPTIONS.map(({ value, title, text, icon: Icon }) => {
                                    const selected = intent === value;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() => setIntent(value)}
                                            className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                                selected ? "border-primary bg-primary/5" : "hover:bg-accent"
                                            }`}
                                        >
                                            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                                            <span>
                                                <span className="block font-medium">{title}</span>
                                                <span className="block text-sm text-muted-foreground">{text}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-between">
                            <Button variant="ghost" disabled={saving} onClick={() => void finish({ intent: "skip" })}>
                                Skip for now
                            </Button>
                            <Button disabled={saving} onClick={handleUsageContinue}>
                                {saving ? "Saving…" : "Continue"}
                            </Button>
                        </CardFooter>
                    </>
                )}

                {step === "business" && (
                    <form onSubmit={handleBusinessSubmit}>
                        <CardHeader>
                            <CardTitle>Name your business</CardTitle>
                            <CardDescription>
                                Business income, expenses and subscriptions stay separate from your personal records.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-2">
                            <Label htmlFor="business-name">Business name</Label>
                            <Input
                                id="business-name"
                                value={businessName}
                                onChange={(event) => setBusinessName(event.target.value)}
                                maxLength={40}
                                placeholder="e.g. Acme Studio"
                                autoFocus
                            />
                        </CardContent>
                        <CardFooter className="flex justify-between">
                            <Button type="button" variant="ghost" disabled={saving} onClick={() => setStep("usage")}>
                                Back
                            </Button>
                            <Button type="submit" disabled={saving || !businessName.trim()}>
                                {saving ? "Creating…" : "Create business"}
                            </Button>
                        </CardFooter>
                    </form>
                )}

                {step === "done" && (
                    <>
                        <CardHeader>
                            <CardTitle>You&apos;re all set</CardTitle>
                            <CardDescription>Add your first record, or head to the dashboard.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            <Button asChild variant="outline"><Link href="/subscriptions?create=1">Add a subscription</Link></Button>
                            <Button asChild variant="outline"><Link href="/expenses?create=1">Log an expense</Link></Button>
                        </CardContent>
                        <CardFooter>
                            <Button asChild className="w-full"><Link href="/dashboard">Go to dashboard</Link></Button>
                        </CardFooter>
                    </>
                )}
            </Card>
        </main>
    );
}
