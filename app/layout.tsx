import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "./brand-theme.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { Suspense } from "react";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// Each font needs its own custom property. They previously all declared
// `--font-inter`, so Inter won and --font-space-grotesk / --font-jetbrains-mono
// were never defined — headings and font-mono silently fell back to the system.
const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
    variable: "--font-jetbrains-mono",
    subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
    variable: "--font-space-grotesk",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    // Resolves relative OG/Twitter image URLs to absolute ones.
    metadataBase: new URL(SITE_URL),
    title: {
        default: SITE_NAME,
        template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    icons: {
        icon: "/icon.svg",
    },
    keywords: [
        "expense tracker",
        "subscription tracker",
        "recurring charges",
        "personal finance",
        "budgeting",
    ],
    openGraph: {
        type: "website",
        url: SITE_URL,
        siteName: SITE_NAME,
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
    },
    twitter: {
        card: "summary",
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        /*
          Clerk needs these to reach your own auth screens. Without them,
          `redirectToSignIn()` in proxy.ts has no configured destination and
          falls back to Clerk's hosted pages at <instance>.accounts.dev —
          sending users out to Clerk and back for every protected route.
        */
        <ClerkProvider signInUrl="/auth/sign-in" signUpUrl="/auth/sign-up">
            <html lang="en" suppressHydrationWarning>
                <body
                    className={`${jetbrainsMono.variable} ${spaceGrotesk.variable} ${inter.variable} antialiased`}
                    suppressHydrationWarning
                >
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="system"
                        enableSystem
                        disableTransitionOnChange
                    >
                        {/*
                          Suspense is required here, not decorative: the
                          statically-rendered dashboard reads `?currency` via
                          useSearchParams, which Next only allows inside a
                          boundary. It no longer wraps a TanStack QueryClient —
                          Refine mounts its own, so the extra one was dead
                          weight.
                        */}
                        <Suspense fallback={null}>{children}</Suspense>
                    </ThemeProvider>
                    <Toaster />
                </body>
            </html>
        </ClerkProvider>
    );
}
