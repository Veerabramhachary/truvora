import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { needsOnboarding } from "@/lib/onboarding";
import OnboardingWizard from "./OnboardingWizard";

export const metadata: Metadata = { title: "Set up your records" };

export default async function OnboardingPage() {
    const { userId } = await auth();
    if (!userId) redirect("/auth/sign-in");
    // Finished (or existing) users have nothing to do here.
    if (!(await needsOnboarding(userId))) redirect("/dashboard");

    return <OnboardingWizard />;
}
