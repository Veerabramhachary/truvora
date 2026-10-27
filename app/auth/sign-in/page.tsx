"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignIn, useUser } from "@clerk/nextjs";
import { Github, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clerkErrorMessage } from "@/lib/api-error";

type FieldErrors = { email?: string; password?: string };

const SignIn = () => {
    const { isLoaded, signIn, setActive } = useSignIn();
    // `useSignIn` doesn't expose `isSignedIn` in Clerk v6 — `useUser` does.
    const { isLoaded: userLoaded, isSignedIn } = useUser();
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [verificationCode, setVerificationCode] = useState("");
    const [verificationRequired, setVerificationRequired] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Field-level messages render beside the input; the form-level one catches
    // everything Clerk rejects after submit (wrong password, locked account…).
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<string | null>(null);

    // Already signed in? Send them straight to the dashboard. Without this the
    // form renders, they submit, and Clerk either rejects the credentials or
    // the middleware bounces them — either way they never get where they were
    // trying to go.
    useEffect(() => {
        if (userLoaded && isSignedIn) {
            router.replace("/dashboard");
        }
    }, [userLoaded, isSignedIn, router]);

    // Nothing but a spinner while that runs, so the form doesn't flash first.
    if (userLoaded && isSignedIn) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2
                    className="h-8 w-8 animate-spin text-primary"
                    aria-hidden="true"
                />
                <span className="sr-only">
                    Already signed in — opening your dashboard…
                </span>
            </div>
        );
    }

    const validate = (): FieldErrors => {
        const next: FieldErrors = {};
        if (!email.trim()) {
            next.email = "Enter your email address";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            next.email = "That doesn't look like a valid email address";
        }
        if (!password) {
            next.password = "Enter your password";
        }
        return next;
    };

    // Email/Password Sign-In
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isLoading || !isLoaded) return;

        setFormError(null);
        const errors = validate();
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsLoading(true);
        try {
            const result = await signIn.create({
                identifier: email.trim(),
                password,
            });

            if (result.status === "complete") {
                toast.success("Signed in. Redirecting…");
                await setActive({ session: result.createdSessionId });
                router.push("/dashboard");
            } else if (result.status === "needs_first_factor") {
                const emailFactor = result.supportedFirstFactors?.find(
                    (factor) => factor.strategy === "email_code",
                );

                if (!emailFactor || emailFactor.strategy !== "email_code") {
                    setFormError(
                        "Your account needs another verification method. Contact support to finish signing in.",
                    );
                    return;
                }

                await signIn.prepareFirstFactor({
                    strategy: "email_code",
                    emailAddressId: emailFactor.emailAddressId,
                });
                setVerificationRequired(true);
                toast.success("We sent a verification code to your email.");
            } else {
                setFormError(
                    "Additional verification is required before you can continue.",
                );
            }
        } catch (error: unknown) {
            setFormError(
                clerkErrorMessage(error, "We couldn't sign you in. Try again."),
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuthSignIn = async (
        provider: "oauth_google" | "oauth_github",
    ) => {
        if (!isLoaded) return;
        setFormError(null);
        try {
            await signIn.authenticateWithRedirect({
                strategy: provider,
                redirectUrl: "/sso-callback",
                redirectUrlComplete: "/dashboard",
            });
        } catch (error: unknown) {
            setFormError(
                clerkErrorMessage(error, "We couldn't start sign-in. Try again."),
            );
        }
    };

    const handleVerifySignIn = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!isLoaded || isLoading) return;
        if (!verificationCode.trim()) {
            setFormError("Enter the verification code we emailed you.");
            return;
        }

        setIsLoading(true);
        setFormError(null);
        try {
            const result = await signIn.attemptFirstFactor({
                strategy: "email_code",
                code: verificationCode.trim(),
            });
            if (result.status === "complete") {
                await setActive({ session: result.createdSessionId });
                toast.success("Verified. Redirecting…");
                router.push("/dashboard");
            } else {
                setFormError(
                    "Another verification step is required. Please contact support.",
                );
            }
        } catch (error: unknown) {
            setFormError(
                clerkErrorMessage(error, "That code didn't work. Try again."),
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full min-h-screen flex flex-col lg:flex-row items-center justify-center p-4 lg:p-10 bg-background">
            {/* Text Section (unchanged) */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-10">
                <div className="max-w-lg">
                    <h1 className="font-bold text-4xl mb-4 leading-tight text-foreground">
                        Welcome Back to Smarter Financial Control
                    </h1>
                    <p className="text-muted-foreground font-light text-lg mb-8">
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
                    <p className="text-primary font-medium">
                        Sign in and take charge.
                    </p>
                </div>
            </div>

            {/* Sign In Form */}
            <div className="w-full max-w-md border border-border shadow-2xl rounded-3xl px-6 py-10 md:px-9 md:py-16 bg-background">
                <div className="w-full mb-8">
                    <h1 className="font-bold text-2xl">
                        {verificationRequired ? "Verify your sign in" : "Sign In"}
                    </h1>
                    <p className="text-muted-foreground">
                        {verificationRequired
                            ? `Enter the verification code sent to ${email.trim()}.`
                            : "Welcome back — sign in to your account"}
                    </p>
                </div>
                <form onSubmit={verificationRequired ? handleVerifySignIn : handleSubmit} noValidate className="w-full">
                    <div className="space-y-4">
                        {verificationRequired ? (
                            <div>
                                <label htmlFor="verification-code" className="font-semibold block mb-1">
                                    Verification code
                                </label>
                                <Input
                                    id="verification-code"
                                    name="one-time-code"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={verificationCode}
                                    onChange={(event) => setVerificationCode(event.target.value)}
                                    className="w-full border-2 border-border py-6"
                                    autoFocus
                                />
                            </div>
                        ) : (
                        <>
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
                                    if (fieldErrors.email) {
                                        setFieldErrors((f) => ({
                                            ...f,
                                            email: undefined,
                                        }));
                                    }
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
                                autoComplete="current-password"
                                aria-invalid={Boolean(fieldErrors.password)}
                                aria-describedby={
                                    fieldErrors.password
                                        ? "password-error"
                                        : undefined
                                }
                                className="w-full border-2 border-border focus:border-ring transition-colors py-6"
                                value={password}
                                placeholder="Enter your password"
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (fieldErrors.password) {
                                        setFieldErrors((f) => ({
                                            ...f,
                                            password: undefined,
                                        }));
                                    }
                                }}
                            />
                            {fieldErrors.password && (
                                <p
                                    id="password-error"
                                    role="alert"
                                    className="mt-2 text-sm text-destructive"
                                >
                                    {fieldErrors.password}
                                </p>
                            )}
                        </div>
                        </>
                        )}

                        {!verificationRequired && <div id="clerk-captcha" />}

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
                                disabled={isLoading}
                                className="w-full py-7 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                            >
                                {isLoading && (
                                    <Loader2
                                        className="me-2 h-4 w-4 animate-spin"
                                        aria-hidden="true"
                                    />
                                )}
                                {isLoading
                                    ? verificationRequired ? "Verifying…" : "Signing in…"
                                    : verificationRequired ? "Verify and continue" : "Sign In"}
                            </Button>

                            {!verificationRequired && <>
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
                                    onClick={() =>
                                        handleOAuthSignIn("oauth_google")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-foreground bg-background border border-border hover:bg-muted shadow-sm font-semibold cursor-pointer"
                                >
                                    Google
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() =>
                                        handleOAuthSignIn("oauth_github")
                                    }
                                    className="flex items-center justify-center gap-2 p-4 text-foreground bg-background border border-border hover:bg-muted shadow-sm font-semibold cursor-pointer"
                                >
                                    <Github size={20} aria-hidden="true" />{" "}
                                    Github
                                </Button>
                            </div>
                            </>}
                        </div>

                        <p className="text-center mt-6 text-muted-foreground">
                            Don&apos;t have an account?{" "}
                            <Link
                                href="/auth/sign-up"
                                className="text-primary font-bold hover:underline"
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
