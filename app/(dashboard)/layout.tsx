import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { needsOnboarding } from "@/lib/onboarding";
import DashboardShell from "./components/DashboardShell";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // New accounts go through the setup wizard first. This runs on every full
    // page load of a dashboard route, so it covers email sign-up, Google
    // sign-up and anyone who closed the wizard half-way. (Signed-out requests
    // never get here: proxy.ts redirects them to sign-in.)
    const { userId } = await auth();
    if (userId && (await needsOnboarding(userId))) {
        redirect("/onboarding");
    }

    return <DashboardShell>{children}</DashboardShell>;
}
