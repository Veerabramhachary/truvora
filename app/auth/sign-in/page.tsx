"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignIn } from "@clerk/nextjs";
import { Github } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// helper
function getLocaleFromCookie(): string {
    if (typeof document === "undefined") return "en"; // fallback for SSR
    const match = document.cookie.match(/(^| )NEXT_LOCALE=([^;]+)/);
    return match ? match[2] : "en";
}

const SignIn = () => {
    const [locale, setLocale] = useState("en");
    const { isLoaded, signIn, setActive } = useSignIn();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setLocale(getLocaleFromCookie());
    }, []);

    // Email/Password Sign-In
    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isLoading || !isLoaded) return;

        // Basic validation
        if (!email || !password) {
            toast.error("Email and password are required");
            return;
        }

        setIsLoading(true);
        try {
            const result = await signIn.create({
                identifier: email,
                password,
            });

            if (result.status === "complete") {
                toast.success("Login successful! Redirecting...");
                await setActive({ session: result.createdSessionId });
                router.push(`${locale}/dashboard`);
            } else {
                // Handle MFA, email verification, etc.
                toast.info("Additional verification required.");
                // Optionally redirect to a verification page
                // router.push(`/verify?signInId=${result.id}`);
            }
        } catch (error: unknown) {
            let message = "An error occurred during sign in.";
            if (error instanceof Error) {
                // Try to extract Clerk's user-friendly message
                const clerkError = error as any; // or use a type guard
                message = clerkError.errors?.[0]?.message || error.message;
            }
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuthSignIn = async (
        provider: "oauth_google" | "oauth_github",
    ) => {
        if (!isLoaded) return;
        try {
            await signIn.authenticateWithRedirect({
                strategy: provider,
                redirectUrl: "/sso-callback",
                redirectUrlComplete: `/${locale}/dashboard`,
            });
        } catch (error: unknown) {
            if (error instanceof Error) {
                toast.error(error.message);
            } else {
                toast.error("An unknown error occurred", {
                    position: "top-left",
                });
            }
        }
    };

    return (
        <div className="w-full min-h-screen flex flex-col lg:flex-row items-center justify-center p-4 lg:p-10 bg-background ">
            {/* Text Section (unchanged) */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-10">
                <div className="max-w-lg">
                    <h1 className="font-bold text-4xl mb-4 leading-tight text-foreground">
                        Welcome Back to Smarter Financial Control
                    </h1>
                    <p className="text-gray-500 font-light text-lg mb-8">
                        Access your secure financial dashboard and stay in
                        control of every transaction. Your data is protected
                        with enterprise-grade security and encrypted
                        authentication — because your trust matters.
                    </p>

                    <ul className="font-medium space-y-3 mb-10">
                        <li className="flex items-center gap-2">
                            ✓ Secure Login
                        </li>
                        <li className="flex items-center gap-2">
                            ✓ End-to-End Encrypted Sessions
                        </li>
                        <li className="flex items-center gap-2">
                            ✓ Private & Protected Financial Insights
                        </li>
                    </ul>

                    <h3 className="font-semibold text-xl">
                        Continue building clarity, confidence, and control.
                    </h3>
                    <p className="text-blue-600 font-medium">
                        Sign in and take charge.
                    </p>
                </div>
            </div>

            {/* Sign In Form */}
            <div className="w-full max-w-md border border-border shadow-2xl rounded-3xl px-6 py-10 md:px-9 md:py-16 bg-background">
                <div className="w-full mb-8">
                    <h1 className="font-bold text-2xl">Sign In</h1>
                    <p className="text-gray-400">
                        Login Back to Smarter Financial Control
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="w-full ">
                    <div className="space-y-4 ">
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
                                value={password}
                                placeholder="Enter your Password"
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <p className="mt-2 text-[12px] text-gray-400">
                                Use 8 or more characters with a mix of letters,
                                numbers & symbols
                            </p>
                        </div>

                        <div id="clerk-captcha" />

                        <div className="flex flex-col gap-3 pt-2">
                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-7 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                            >
                                {isLoading ? "Signing In..." : "Sign In"}
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
                                        handleOAuthSignIn("oauth_google")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm font-semibold cursor-pointer"
                                >
                                    Google
                                </Button>
                                <Button
                                    onClick={() =>
                                        handleOAuthSignIn("oauth_github")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm font-semibold cursor-pointer"
                                >
                                    <Github size={20} /> Github
                                </Button>
                            </div>
                        </div>

                        <p className="text-center mt-6 text-gray-600">
                            Don't have an account?{" "}
                            <Link
                                href="/auth/sign-up"
                                className="text-blue-600 font-bold hover:underline"
                            >
                                Sign Up
                            </Link>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SignIn;
