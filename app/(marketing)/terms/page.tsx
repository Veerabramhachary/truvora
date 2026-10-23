import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Terms of Service",
    description: "The terms that govern your use of Truvora.",
};

export default function TermsPage() {
    return (
        <article className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Terms of Service
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
                Last updated: October 2026
            </p>

            <div className="mt-10 space-y-8 text-base leading-relaxed text-muted-foreground">
                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        1. Acceptance of terms
                    </h2>
                    <p>
                        By creating an account or otherwise using Truvora, you
                        agree to these terms. If you do not agree, do not use
                        the service.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        2. Your account
                    </h2>
                    <p>
                        You are responsible for keeping your sign-in
                        credentials secure and for all activity that happens
                        under your account. Tell us promptly if you believe your
                        account has been compromised.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        3. Acceptable use
                    </h2>
                    <p>
                        You agree not to misuse the service — including
                        attempting to access it without authorisation, probing
                        or disrupting our systems, reverse engineering the
                        service except where the law permits it, or using the
                        service to store or transmit unlawful content.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        4. Your data
                    </h2>
                    <p>
                        You retain ownership of the financial records you enter.
                        You grant us only the limited licence needed to operate
                        the service — storing, processing and displaying that
                        data back to you. See our{" "}
                        <a
                            href="/privacy-policy"
                            className="text-primary underline underline-offset-4"
                        >
                            Privacy Policy
                        </a>{" "}
                        for detail.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        5. Billing and refunds
                    </h2>
                    <p>
                        Paid plans are billed in advance for each billing
                        period. Unless the law requires otherwise, payments are
                        non-refundable once a period has started. You can cancel
                        at any time and keep access until the end of the period
                        you already paid for.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        6. Availability
                    </h2>
                    <p>
                        We work to keep Truvora available but provide it
                        &quot;as is&quot; without guarantees of uninterrupted or
                        error-free operation. To the extent permitted by law we
                        are not liable for indirect or consequential losses
                        arising from your use of the service.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        7. Changes to these terms
                    </h2>
                    <p>
                        We may update these terms as the service evolves. We
                        will revise the date at the top of this page when we do;
                        continued use after a change means you accept it.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        8. Contact
                    </h2>
                    <p>
                        Questions about these terms can be raised from within
                        your account settings.
                    </p>
                </section>
            </div>
        </article>
    );
}
