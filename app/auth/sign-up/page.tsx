"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignUp } from "@clerk/nextjs";
import { Github, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { clerkErrorMessage } from "@/lib/api-error";

type FieldErrors = {
    name?: string;
    email?: string;
    password?: string;
    terms?: string;
};

const Page = () => {
    const router = useRouter();

    const [firstName, setFirstName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const { isLoaded, signUp } = useSignUp();

    const [isLoading, setIsLoading] = useState(false);
    const [oAuthLoading, setOAuthLoading] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<string | null>(null);

    const clearField = (field: keyof FieldErrors) => {
        setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const validate = (): FieldErrors => {
        const next: FieldErrors = {};
        if (!firstName.trim()) {
            next.name = "Enter your name";
        }
        if (!email.trim()) {
            next.email = "Enter your email address";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            next.email = "That doesn't look like a valid email address";
        }
        if (!password) {
            next.password = "Choose a password";
        } else if (password.length < 8) {
            next.password = "Use at least 8 characters";
        }
        if (!acceptedTerms) {
            next.terms = "You need to accept the Terms to create an account";
        }
        return next;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!isLoaded || isLoading) return;

        setFormError(null);
        const errors = validate();
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsLoading(true);
        try {
            const result = await signUp.create({
                firstName: firstName.trim(),
                emailAddress: email.trim(),
                password,
            });
            if (result.status === "missing_requirements") {
                // Trigger email verification, then hand off to the code screen.
                await signUp.prepareEmailAddressVerification({
                    strategy: "email_code",
                });
                toast.success("Verification code sent!");
                router.push(
                    `/auth/verify-email?email=${encodeURIComponent(email.trim())}`,
                );
            } else if (result.status === "complete") {
                // No verification required for this instance.
                router.push("/dashboard");
            }
        } catch (error: unknown) {
            setFormError(
                clerkErrorMessage(error, "We couldn't create your account. Try again."),
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuthSignUp = async (
        provider: "oauth_google" | "oauth_github",
    ) => {
        if (!isLoaded || !signUp || oAuthLoading) return;

        setOAuthLoading(provider);
        setFormError(null);

        try {
            await signUp.authenticateWithRedirect({
                strategy: provider,
                redirectUrl: "/sso-callback",
                redirectUrlComplete: "/dashboard",
            });
        } catch (error: unknown) {
            setFormError(
                clerkErrorMessage(
                    error,
                    "We couldn't start sign-up. Try again.",
                ),
            );
        } finally {
            setOAuthLoading(null);
        }
    };

    return (
        <div className="w-full min-h-screen flex flex-col lg:flex-row items-center justify-center p-4 lg:p-10 bg-background">
            {/* Text Section: hidden below lg so the form isn't squeezed */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-10">
                <div className="max-w-lg">
                    <h1 className="font-bold text-4xl mb-4 leading-tight">
                        Start Your Financial Journey with Confidence
                    </h1>
                    <p className="text-muted-foreground font-light text-lg mb-8">
                        Create your account and experience professional-grade
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
                            ✓ Designed for professionals and modern users
                        </li>
                    </ul>

                    <h3 className="font-semibold text-xl">
                        Build better habits. Make smarter moves.
                    </h3>
                    <p className="text-primary font-medium">
                        Start today with confidence
                    </p>
                </div>
            </div>

            {/* Sign Up Form */}
            <div className="w-full max-w-md bg-background border border-border shadow-2xl rounded-3xl px-6 py-10 md:px-9 md:py-16">
                <div className="w-full mb-8">
                    <h1 className="font-bold text-2xl">Sign Up</h1>
                    <p className="text-muted-foreground">
                        Create your secure account now
                    </p>
                </div>

                <form onSubmit={handleSubmit} noValidate className="w-full">
                    <div className="space-y-4">
                        <div>
                            <label
                                htmlFor="name"
                                className="font-semibold block mb-1"
                            >
                                Name
                            </label>
                            <Input
                                id="name"
                                name="name"
                                autoComplete="given-name"
                                aria-invalid={Boolean(fieldErrors.name)}
                                aria-describedby={
                                    fieldErrors.name ? "name-error" : undefined
                                }
                                className="w-full border-2 border-border focus:border-ring transition-colors py-6"
                                value={firstName}
                                onChange={(e) => {
                                    setFirstName(e.target.value);
                                    clearField("name");
                                }}
                                placeholder="Enter your name"
                            />
                            {fieldErrors.name && (
                                <p
                                    id="name-error"
                                    role="alert"
                                    className="mt-2 text-sm text-destructive"
                                >
                                    {fieldErrors.name}
                                </p>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="email"
                                className="font-semibold block mb-1"
                            >
                                Email
                            </label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                aria-invalid={Boolean(fieldErrors.email)}
                                aria-describedby={
                                    fieldErrors.email ? "email-error" : undefined
                                }
                                className="w-full border-2 border-border focus:border-ring transition-colors py-6"
                                value={email}
                                placeholder="you@example.com"
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    clearField("email");
                                }}
                            />
                            {fieldErrors.email && (
                                <p
                                    id="email-error"
                                    role="alert"
                                    className="mt-2 text-sm text-destructive"
                                >
                                    {fieldErrors.email}
                                </p>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="font-semibold block mb-1"
                            >
                                Password
                            </label>
                            <Input
                                id="password"
                                type="password"
                                name="password"
                                autoComplete="new-password"
                                aria-invalid={Boolean(fieldErrors.password)}
                                aria-describedby={
                                    fieldErrors.password
                                        ? "password-error"
                                        : "password-hint"
                                }
                                className="w-full border-2 border-border focus:border-ring transition-colors py-6"
                                placeholder="Create a password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    clearField("password");
                                }}
                            />
                            {fieldErrors.password ? (
                                <p
                                    id="password-error"
                                    role="alert"
                                    className="mt-2 text-sm text-destructive"
                                >
                                    {fieldErrors.password}
                                </p>
                            ) : (
                                <p
                                    id="password-hint"
                                    className="mt-2 text-xs text-muted-foreground"
                                >
                                    Use 8 or more characters with a mix of
                                    letters, numbers &amp; symbols
                                </p>
                            )}
                        </div>

                        <div className="flex items-start gap-2 py-2">
                            <input
                                type="checkbox"
                                id="terms"
                                checked={acceptedTerms}
                                aria-invalid={Boolean(fieldErrors.terms)}
                                aria-describedby={
                                    fieldErrors.terms ? "terms-error" : undefined
                                }
                                onChange={(e) => {
                                    setAcceptedTerms(e.target.checked);
                                    clearField("terms");
                                }}
                                className="mt-1 w-4 h-4 cursor-pointer"
                            />
                            <label htmlFor="terms" className="text-sm">
                                I accept the{" "}
                                <Link
                                    href="/terms"
                                    className="text-primary underline underline-offset-2 hover:no-underline"
                                >
                                    Terms of Service
                                </Link>{" "}
                                and{" "}
                                <Link
                                    href="/privacy-policy"
                                    className="text-primary underline underline-offset-2 hover:no-underline"
                                >
                                    Privacy Policy
                                </Link>
                            </label>
                        </div>
                        {fieldErrors.terms && (
                            <p
                                id="terms-error"
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {fieldErrors.terms}
                            </p>
                        )}

                        <div id="clerk-captcha" />

                        {formError && (
                            <p
                                role="alert"
                                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                            >
                                {formError}
                            </p>
                        )}

                        <div className="flex flex-col gap-3 pt-2">
                            <Button
                                type="submit"
                                disabled={isLoading || Boolean(oAuthLoading)}
                                className="w-full py-7 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                            >
                                {isLoading && (
                                    <Loader2
                                        className="me-2 h-4 w-4 animate-spin"
                                        aria-hidden="true"
                                    />
                                )}
                                {isLoading ? "Signing up…" : "Sign Up"}
                            </Button>

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-border"></span>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">
                                        Or continue with
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Button
                                    type="button"
                                    disabled={Boolean(oAuthLoading)}
                                    onClick={() =>
                                        handleOAuthSignUp("oauth_google")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-foreground bg-background border border-border hover:bg-muted shadow-sm font-semibold cursor-pointer disabled:opacity-60"
                                >
                                    {oAuthLoading === "oauth_google" && (
                                        <Loader2
                                            className="h-4 w-4 animate-spin"
                                            aria-hidden="true"
                                        />
                                    )}
                                    Google
                                </Button>
                                <Button
                                    type="button"
                                    disabled={Boolean(oAuthLoading)}
                                    onClick={() =>
                                        handleOAuthSignUp("oauth_github")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-foreground bg-background border border-border hover:bg-muted shadow-sm font-semibold cursor-pointer disabled:opacity-60"
                                >
                                    {oAuthLoading === "oauth_github" ? (
                                        <Loader2
                                            className="h-4 w-4 animate-spin"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <Github size={20} aria-hidden="true" />
                                    )}
                                    Github
                                </Button>
                            </div>
                        </div>

                        <p className="text-center mt-6 text-muted-foreground">
                            Already have an account?{" "}
                            <Link
                                href="/auth/sign-in"
                                className="text-primary font-bold hover:underline"
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
