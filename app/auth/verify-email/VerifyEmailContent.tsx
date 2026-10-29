"use client";

import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { clerkErrorMessage } from "@/lib/api-error";

const RESEND_SECONDS = 60;

export default function VerifyEmailContent() {
    const { isLoaded, signUp, setActive } = useSignUp();
    const router = useRouter();
    const email = signUp?.emailAddress ?? "";

    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState(RESEND_SECONDS);
    const [formError, setFormError] = useState<string | null>(null);
    const [restartSignUp, setRestartSignUp] = useState(false);
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [requirementValues, setRequirementValues] = useState<Record<string, string>>({});

    // Whether resending is allowed is a function of the timer, not a second
    // piece of state — keeping it in state meant writing it back from inside an
    // effect, which is both redundant and a cascading-render hazard.
    const canResend = timeLeft <= 0;

    const finishSignUp = async (result: NonNullable<typeof signUp>) => {
        if (!setActive) return false;
        if (result.status === "complete" && result.createdSessionId) {
            await setActive({ session: result.createdSessionId });
            toast.success("Email verified. Redirecting to dashboard…");
            router.replace("/dashboard");
            return true;
        }

        const emailStillUnverified = result.unverifiedFields?.includes("email_address");
        setMissingFields(emailStillUnverified ? [] : (result.missingFields ?? []));
        setRequirementValues({});
        return false;
    };

    // Countdown for resend
    useEffect(() => {
        if (timeLeft <= 0) return;
        const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [timeLeft]);

    // If there's no active sign-up, tell the user and go back. Kept out of the
    // render path so it doesn't fire side effects during render (StrictMode
    // would double-invoke them).
    useEffect(() => {
        if (isLoaded && !signUp) {
            toast.error("No active sign-up found. Please start again.");
            router.push("/auth/sign-up");
        }
    }, [isLoaded, signUp, router]);

    // While Clerk is still loading — or the sign-up is gone — show a spinner
    // rather than the form, which would fail on submit anyway.
    if (!isLoaded || !signUp) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2
                    className="h-8 w-8 animate-spin text-primary"
                    aria-hidden="true"
                />
                <span className="sr-only">Loading verification…</span>
            </div>
        );
    }

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded || isLoading) return;
        setFormError(null);

        const trimmed = code.trim();
        if (!trimmed) {
            setFormError("Enter the verification code we emailed you");
            return;
        }

        setIsLoading(true);
        try {
            const result = await signUp.attemptEmailAddressVerification({
                code: trimmed,
            });

            if (result.status === "complete") {
                await finishSignUp(result);
            } else {
                await finishSignUp(result);
                setFormError("Your email could not be verified yet. Please try again.");
            }
        } catch (error: unknown) {
            // A code can be consumed before the response reaches this page
            // (for example, after a retry). Refresh Clerk's sign-up state
            // before treating the attempt as a failed verification.
            try {
                const currentSignUp = await signUp.reload();
                if (await finishSignUp(currentSignUp)) {
                    return;
                }
                if (
                    currentSignUp.missingFields?.length &&
                    !currentSignUp.unverifiedFields?.includes("email_address")
                ) {
                    setFormError(
                        "Your email is verified. Complete the remaining account details below.",
                    );
                    return;
                }
            } catch (recoveryError: unknown) {
                console.error(
                    "Could not resume completed email verification",
                    recoveryError,
                );
            }

            const message = clerkErrorMessage(
                error,
                "That code didn't work. Check it and try again.",
            );
            setFormError(
                message.toLowerCase().includes("already") &&
                    message.toLowerCase().includes("verif")
                    ? "This email is verified, but sign-up did not finish. Return to sign-up to complete your account."
                    : message,
            );
            if (
                message.toLowerCase().includes("already") &&
                message.toLowerCase().includes("verif")
            ) {
                setRestartSignUp(true);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleCompleteSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded || isLoading) return;

        const values = requirementValues;
        const updates: {
            firstName?: string;
            lastName?: string;
            username?: string;
            phoneNumber?: string;
            password?: string;
            legalAccepted?: boolean;
        } = {};
        if (values.first_name?.trim()) updates.firstName = values.first_name.trim();
        if (values.last_name?.trim()) updates.lastName = values.last_name.trim();
        if (values.username?.trim()) updates.username = values.username.trim();
        if (values.phone_number?.trim()) updates.phoneNumber = values.phone_number.trim();
        if (values.password) updates.password = values.password;
        if (missingFields.includes("legal_accepted")) updates.legalAccepted = true;

        setIsLoading(true);
        setFormError(null);
        try {
            const result = await signUp.update(updates);
            if (await finishSignUp(result)) return;
            setFormError(
                "More account details or verification are still required. Check the fields below or contact support.",
            );
        } catch (error: unknown) {
            setFormError(
                clerkErrorMessage(error, "We couldn't finish creating your account."),
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendCode = async () => {
        if (!canResend) return;
        setFormError(null);
        try {
            await signUp.prepareEmailAddressVerification({
                strategy: "email_code",
            });
            toast.success("New verification code sent!");
            setTimeLeft(RESEND_SECONDS);
        } catch (error: unknown) {
            setFormError(
                clerkErrorMessage(error, "We couldn't resend the code."),
            );
        }
    };

    return (
        <div className="w-full min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="w-full max-w-md bg-card border border-border shadow-2xl rounded-3xl px-6 py-10 md:px-9 md:py-16">
                <div className="text-center mb-8">
                    <h1 className="font-bold text-2xl">Verify Your Email</h1>
                    <p className="text-muted-foreground mt-2">
                        We sent a verification code to <br />
                        <span className="font-medium text-foreground">
                            {email}
                        </span>
                    </p>
                </div>

                {missingFields.length > 0 ? (
                <form onSubmit={handleCompleteSignUp} noValidate className="space-y-6">
                    {missingFields.map((field) => {
                        const labels: Record<string, string> = {
                            first_name: "First name",
                            last_name: "Last name",
                            username: "Username",
                            phone_number: "Phone number",
                            password: "Password",
                        };
                        const label = labels[field];
                        if (!label) return null;
                        return (
                            <div key={field}>
                                <label htmlFor={`requirement-${field}`} className="font-semibold block mb-1">
                                    {label}
                                </label>
                                <Input
                                    id={`requirement-${field}`}
                                    type={field === "password" ? "password" : "text"}
                                    autoComplete={field === "password" ? "new-password" : "off"}
                                    value={requirementValues[field] ?? ""}
                                    onChange={(event) => setRequirementValues((current) => ({ ...current, [field]: event.target.value }))}
                                    required
                                    className="w-full border-2 border-border py-6"
                                />
                            </div>
                        );
                    })}
                    {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
                    <Button type="submit" disabled={isLoading} className="w-full py-7">
                        {isLoading ? "Finishing sign-up…" : "Complete sign-up"}
                    </Button>
                </form>
                ) : <form onSubmit={handleVerify} noValidate className="space-y-6">
                    <div>
                        <label
                            htmlFor="code"
                            className="font-semibold block mb-1"
                        >
                            Verification Code
                        </label>
                        <Input
                            id="code"
                            name="one-time-code"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={8}
                            value={code}
                            onChange={(e) => {
                                setCode(e.target.value);
                                if (formError) setFormError(null);
                            }}
                            placeholder="Enter 6-digit code"
                            aria-invalid={Boolean(formError)}
                            aria-describedby={
                                formError ? "code-error" : undefined
                            }
                            className="w-full border-2 border-border focus:border-ring transition-colors py-6 text-center text-lg tracking-widest text-foreground bg-background"
                        />
                        {formError && (
                            <p
                                id="code-error"
                                role="alert"
                                className="mt-2 text-sm text-destructive"
                            >
                                {formError}
                            </p>
                        )}
                    </div>

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
                        {isLoading ? "Verifying…" : "Verify Email"}
                    </Button>
                </form>}

                <div className="mt-6 text-center">
                    <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={!canResend || isLoading}
                        className={`text-sm font-medium ${
                            canResend && !isLoading
                                ? "text-primary hover:underline cursor-pointer"
                                : "text-muted-foreground cursor-not-allowed"
                        }`}
                    >
                        Resend code {!canResend && `(${timeLeft}s)`}
                    </button>
                </div>

                <p className="text-center mt-8 text-muted-foreground">
                    {restartSignUp ? "Continue creating your account: " : "Already have an account? "}
                    <Link
                        href={restartSignUp ? "/auth/sign-up" : "/auth/sign-in"}
                        className="text-primary font-bold hover:underline"
                    >
                        {restartSignUp ? "Return to sign-up" : "Sign In"}
                    </Link>
                </p>
            </div>
        </div>
    );
}
