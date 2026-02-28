"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignIn } from "@clerk/nextjs";
import { Github } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const SignIn = () => {
    const { isLoaded, signIn, setActive } = useSignIn();
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    if (!isLoaded) return null;

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            console.log("clicked");
            
            const result = await signIn.create({
                identifier: email,
                password,
            });

            if (result.status === "complete") {
                await setActive({ session: result.createdSessionId });
                router.push("/app/dashboard");
            }
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

    const handleOAuthSignIn = async (
        provider: "oauth_google" | "oauth_github",
    ) => {
        try {
            await signIn.authenticateWithRedirect({
                strategy: provider,
                redirectUrl: "/sso-callback",
                redirectUrlComplete: "/app/dashboard",
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
        <div className="w-full min-h-screen flex flex-col lg:flex-row items-center justify-center p-4 lg:p-10 bg-gray-50">
            {/* Text Section: Hide on small/medium screens to prevent compression, show only on large screens */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-10">
                <div className="max-w-lg">
                    <h1 className="font-bold text-4xl mb-4 leading-tight">
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

            {/* Sign Up Form: Added 'bg-white' and 'mx-auto' for better mobile centering */}
            <div className="w-full max-w-md bg-white border border-gray-100 shadow-2xl rounded-3xl px-6 py-10 md:px-9 md:py-16">
                <div className="w-full mb-8">
                    <h1 className="font-bold text-2xl">Sign Up</h1>
                    <p className="text-gray-400">
                        Create your secure account now
                    </p>
                </div>
                <form onSubmit={()=>handleSubmit} className="w-full">
                    <div className="space-y-4">
                        <div>
                            <label
                                htmlFor="email"
                                className="font-semibold block mb-1"
                            >
                                Email
                            </label>
                            <Input
                                className="w-full outline-0 border-2 border-gray-200 focus:border-blue-500 transition-colors py-6"
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
                                className="w-full outline-0 border-2 border-gray-200 focus:border-blue-500 transition-colors py-6"
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

                        <div className="flex items-center gap-2 py-2"></div>

                        <div className="flex flex-col gap-3 pt-2">
                            <Button
                                type="submit"
                                className="w-full py-7 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all
                                cursor-pointer"
                            >
                                Sign In
                            </Button>

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-gray-200"></span>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white px-2 text-gray-500">
                                        Or continue with
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Button
                                    onClick={() =>
                                        handleOAuthSignIn("oauth_google")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm font-semibold
                                    cursor-pointer"
                                >
                                    Google
                                </Button>
                                <Button
                                    onClick={() =>
                                        handleOAuthSignIn("oauth_github")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm font-semibold
                                    cursor-pointer"
                                >
                                    <Github size={20} /> Github
                                </Button>
                            </div>
                        </div>

                        <p className="text-center mt-6 text-gray-600">
                            Dont you have an account?{" "}
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
