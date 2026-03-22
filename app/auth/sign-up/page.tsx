"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignUp } from "@clerk/nextjs";
import { Github } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function getLocaleFromCookie(): string {
    if (typeof document === "undefined") return "en"; // fallback for SSR

    const match = document.cookie.match(/(^| )NEXT_LOCALE=([^;]+)/);

    return match ? match[2] : "en";
}

const Page = () => {
    const router = useRouter();

    const [locale, setLocale] = useState("en");

    const [firstName, setFirstName] = useState("");

    const [email, setEmail] = useState("");

    const [password, setPassword] = useState("");

    const { isLoaded, signUp } = useSignUp();

    const [isLoading, setIsLoading] = useState(false);

    const [oAuthLoading, setOAuthLoading] = useState<string | null>(null);

    useEffect(() => {
        setLocale(getLocaleFromCookie());
    }, []);

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!isLoaded || isLoading) return;
        if (!email || !password) {
            toast.error("Email and password are required");
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            toast.error("Please enter a valid email address");
            return;
        }
        setIsLoading(true);
        try {
            const result = await signUp.create({
                firstName,
                emailAddress: email,
                password,
            });
            if (result.status === "missing_requirements") {
                // This is where you trigger the email verification
                await signUp.prepareEmailAddressVerification({
                    strategy: "email_code",
                });
                toast.success("Verification email sent!");
                router.push(
                    `/auth/verify-email?email=${encodeURIComponent(email)}`,
                );
            } else if (result.status === "complete") {
                // This would only happen if you don't require email verification
                router.push(`/${locale}/dashboard`);
            }
        } catch (error: unknown) {
            let message = "An error occurred during sign up.";
            if (error instanceof Error) {
                const clerkError = error as any;
                message = clerkError.error?.[0]?.message || error.message;
            }
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuthSignUp = async (
        provider: "oauth_google" | "oauth_github",
    ) => {
        if (!isLoaded || !signUp || oAuthLoading) return;

        setOAuthLoading(provider);

        try {
            await signUp.authenticateWithRedirect({
                strategy: provider,

                redirectUrl: "/sso-callback",

                redirectUrlComplete: `/${locale}/dashboard`,
            });
        } catch (error: unknown) {
            let message = "An error occurred during OAuth sign up.";

            if (error instanceof Error) {
                message = error.message;
            }

            toast.error(message);
        } finally {
            setOAuthLoading(null);
        }
    };

    return (
        <div className="w-full min-h-screen flex flex-col lg:flex-row items-center justify-center p-4 lg:p-10 bg-background">
            {/* Text Section: Hide on small/medium screens to prevent compression, show only on large screens */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-10">
                <div className="max-w-lg">
                    <h1 className="font-bold text-4xl mb-4 leading-tight">
                        Start Your Financial Journey with Confidence
                    </h1>
                    <p className="text-gray-500 font-light text-lg mb-8">
                        Create your account and experience Professional-grade
                        finance tracking built for clarity and control.
                    </p>

                    <ul className="font-medium space-y-3 mb-10">
                        <li className="flex items-center gap-2">
                            ✓ Bank-level security standards
                        </li>
                        <li className="flex items-center gap-2">
                            ✓ Transparent data protection
                        </li>
                        <li className="flex items-center gap-2">
                            ✓ Designed for Professionals & modern users
                        </li>
                    </ul>

                    <h3 className="font-semibold text-xl">
                        Build better habits. Make smarter moves.
                    </h3>
                    <p className="text-blue-600 font-medium">
                        Start today with confidence
                    </p>
                </div>
            </div>

            {/* Sign Up Form: Added 'bg-white' and 'mx-auto' for better mobile centering */}
            <div className="w-full max-w-md bg-background border border-border shadow-2xl rounded-3xl px-6 py-10 md:px-9 md:py-16">
                <div className="w-full mb-8">
                    <h1 className="font-bold text-2xl">Sign Up</h1>
                    <p className="text-gray-400">
                        Create your secure account now
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="w-full">
                    <div className="space-y-4">
                        <div>
                            <label
                                htmlFor="name"
                                className="font-semibold block mb-1"
                            >
                                Name
                            </label>
                            <Input
                                className="w-full outline-0 border-2 border-border focus:border-blue-500 transition-colors py-6"
                                name="name"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="Enter your Name"
                                required
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="email"
                                className="font-semibold block mb-1"
                            >
                                Email
                            </label>
                            <Input
                                className="w-full outline-0 border-2 border-border focus:border-blue-500 transition-colors py-6"
                                name="email"
                                value={email}
                                placeholder="Enter your Email"
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="password"
                                className="font-semibold block mb-1"
                            >
                                Password
                            </label>
                            <Input
                                type="password"
                                className="w-full outline-0 border-2 border-border focus:border-blue-500 transition-colors py-6"
                                name="password"
                                placeholder="Enter your Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <p className="mt-2 text-[12px] text-gray-400">
                                Use 8 or more characters with a mix of letters,
                                numbers & symbols
                            </p>
                        </div>
                        <div className="flex items-center gap-2 py-2">
                            <input
                                type="checkbox"
                                id="terms"
                                required
                                className="w-4 h-4 cursor-pointer"
                            />
                            <label
                                htmlFor="terms"
                                className="text-sm text-gray-600"
                            >
                                I accept{" "}
                                <span className="text-blue-500 cursor-pointer underline">
                                    Terms
                                </span>
                            </label>
                        </div>
                        <div id="clerk-captcha" />
                        <div className="flex flex-col gap-3 pt-2">
                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-7 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all
                                    cursor-pointer"
                            >
                                {isLoading ? "Signing Up" : "Sign Up"}
                            </Button>

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-gray-200"></span>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-gray-500">
                                        Or continue with
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Button
                                    onClick={() =>
                                        handleOAuthSignUp("oauth_google")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm font-semibold
                                        cursor-pointer"
                                >
                                    Google
                                </Button>
                                <Button
                                    onClick={() =>
                                        handleOAuthSignUp("oauth_github")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm font-semibold
                                        cursor-pointer"
                                >
                                    <Github size={20} /> Github
                                </Button>
                            </div>
                        </div>

                        <p className="text-center mt-6 text-gray-600">
                            Already have an account?{" "}
                            <Link
                                href="/auth/sign-in"
                                className="text-blue-600 font-bold hover:underline"
                            >
                                Sign In
                            </Link>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};
export default Page;
