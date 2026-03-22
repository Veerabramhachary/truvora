import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProviders } from "./providers/querystackProvider";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const jetBrainsMomo = JetBrains_Mono({
    variable: "--font-inter",
    subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
    variable: "--font-inter",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Truvora",
    description: "Expenses/income and subscriptions tracker.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <ClerkProvider>
            <html lang="en" suppressHydrationWarning>
                <body
                    className={`${jetBrainsMomo.variable} ${spaceGrotesk.variable} ${inter.variable} antialiased`}
                    suppressHydrationWarning
                >
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="system"
                        enableSystem
                        disableTransitionOnChange
                    >
                        <QueryProviders>
                            {children}</QueryProviders>
                    </ThemeProvider>
                    <Toaster />
                </body>
            </html>
        </ClerkProvider>
    );
}
