"use client";

import { useSignUp } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

function getLocaleFromCookie(): string {
    if (typeof document === "undefined") return "en";
    const match = document.cookie.match(/(^| )NEXT_LOCALE=([^;]+)/);
    return match ? match[2] : "en";
}

export default function VerifyEmailContent() {
    const [locale, setLocale] = useState("en");
    const { isLoaded, signUp, setActive } = useSignUp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get("email");

    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState(60);
    const [canResend, setCanResend] = useState(false);

    // Countdown for resend
    useEffect(() => {
        if (timeLeft <= 0) {
            setCanResend(true);
            return;
        }
        const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [timeLeft]);

    // If no email in URL, redirect to sign-up
    useEffect(() => {
        if (isLoaded && !email) {
            toast.error("No email provided. Please sign up again.");
            router.push("/auth/sign-up");
        }
    }, [isLoaded, email, router]);

    useEffect(() => {
        setLocale(getLocaleFromCookie());
    }, []);

    // If Clerk is still loading, show a spinner
    if (!isLoaded) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    // If there's no active sign-up, redirect
    if (!signUp) {
        toast.error("No active sign-up found. Please start again.");
        router.push("/auth/sign-up");
        return null;
    }

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code) {
            toast.error("Please enter the verification code");
            return;
        }
        setIsLoading(true);
        try {
            const result = await signUp.attemptEmailAddressVerification({
                code,
            });

            if (result.status === "complete") {
                await setActive({ session: result.createdSessionId });
                toast.success("Email verified! Redirecting to dashboard...");
                router.push(`${locale}/dashboard`);
            } else {
                toast.error("Verification incomplete. Please try again.");
            }
        } catch (error: unknown) {
            let message = "Verification failed. Please check the code.";
            if (error instanceof Error) {
                const clerkError = error as any;
                message = clerkError.errors?.[0]?.message || error.message;
            }
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendCode = async () => {
        if (!canResend) return;
        try {
            await signUp.prepareEmailAddressVerification({
                strategy: "email_code",
            });
            toast.success("New verification code sent!");
            setTimeLeft(60);
            setCanResend(false);
        } catch (error: unknown) {
            let message = "Failed to resend code.";
            if (error instanceof Error) {
                message = error.message;
            }
            toast.error(message);
        }
    };

    return (
        <div className="w-full min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="w-full max-w-md bg-white border border-gray-100 shadow-2xl rounded-3xl px-6 py-10 md:px-9 md:py-16">
                <div className="text-center mb-8">
                    <h1 className="font-bold text-2xl">Verify Your Email</h1>
                    <p className="text-gray-400 mt-2">
                        We sent a verification code to <br />
                        <span className="font-medium text-gray-700">
                            {email}
                        </span>
                    </p>
                </div>

                <form onSubmit={handleVerify} className="space-y-6">
                    <div>
                        <label
                            htmlFor="code"
                            className="font-semibold block mb-1"
                        >
                            Verification Code
                        </label>
                        <Input
                            id="code"
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Enter 6-digit code"
                            className="w-full border-2 border-gray-200 focus:border-blue-500 transition-colors py-6 text-center text-lg tracking-widest text-foreground bg-background"
                            required
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-7 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all cursor-pointer"
                    >
                        {isLoading ? "Verifying..." : "Verify Email"}
                    </Button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={handleResendCode}
                        disabled={!canResend || isLoading}
                        className={`text-sm font-medium ${
                            canResend && !isLoading
                                ? "text-blue-600 hover:underline cursor-pointer"
                                : "text-gray-400 cursor-not-allowed"
                        }`}
                    >
                        Resend code {!canResend && `(${timeLeft}s)`}
                    </button>
                </div>

                <p className="text-center mt-8 text-gray-600">
                    Already have an account?{" "}
                    <Link
                        href="/auth/sign-in"
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Sign In
                    </Link>
                </p>
            </div>
        </div>
    );
}
