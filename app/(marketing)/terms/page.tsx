import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Terms of Service",
    description: "Terms for using the Truvora personal finance tracking service.",
};

export default function TermsPage() {
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

    return (
        <article className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Terms of Service
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
                Last updated: October 26, 2026
            </p>

            <div className="mt-10 space-y-8 text-base leading-relaxed text-muted-foreground">
                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        1. Accepting these terms
                    </h2>
                    <p>
                        By creating an account and accepting these terms, you
                        agree to follow them. If you do not agree, do not create
                        an account or use the service. The Privacy Policy
                        explains how Truvora handles personal data.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        2. Eligibility and your account
                    </h2>
                    <p>
                        Truvora is intended for people aged 18 or older. You
                        are responsible for providing accurate account details,
                        protecting access to your account, and activity carried
                        out through it. Tell us promptly if you believe your
                        account has been compromised.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        3. The service
                    </h2>
                    <p>
                        Truvora helps you record and review expenses, income
                        and recurring subscriptions. You enter and maintain
                        these records yourself. Truvora does not connect to
                        financial accounts or independently verify your
                        entries. The service is for recordkeeping and
                        information only; it is not financial, investment, tax
                        or legal advice. Check your records before relying on
                        them to make decisions.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        4. Your records
                    </h2>
                    <p>
                        You retain your rights to the financial records you
                        enter. You give Truvora permission to host, process,
                        secure and display those records as needed to operate
                        the service and provide its features. We do not use
                        your financial records for advertising. See our{" "}
                        <a
                            href="/privacy-policy"
                            className="text-primary underline underline-offset-4"
                        >
                            Privacy Policy
                        </a>{" "}
                        for details about data handling and deletion.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        5. Plans and payments
                    </h2>
                    <p>
                        Truvora may offer plans with different features or
                        limits. Paid checkout is currently disabled, and you
                        cannot start a paid subscription through the service.
                        If paid checkout becomes available, we will show the
                        price, billing period, renewal, cancellation and refund
                        terms before you purchase.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        6. Acceptable use
                    </h2>
                    <p>
                        Do not use Truvora to break the law, access another
                        person’s account or data, interfere with or disrupt the
                        service, or attempt to bypass its security or plan
                        limits. You may not reverse engineer the service except
                        where applicable law permits it.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        7. Availability
                    </h2>
                    <p>
                        We work to keep Truvora available, but the service may
                        be interrupted for maintenance, updates, provider
                        outages or other events. Features may change as we
                        improve the service.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        8. Account deletion
                    </h2>
                    <p>
                        You can request deletion of your account from Settings.
                        Deletion removes your account and personal financial
                        data from our active systems when processing completes.
                        Limited billing totals may be retained without account
                        or provider identifiers where needed for accounting or
                        fraud prevention. The Privacy Policy explains what is
                        deleted and what may remain in backups or provider logs.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        9. Disclaimers and liability
                    </h2>
                    <p>
                        Truvora is provided as available. We cannot promise
                        uninterrupted or error-free operation, or that reminders
                        will always arrive on time. To the extent permitted by
                        law, Truvora is not responsible for losses arising from
                        incomplete or inaccurate records you enter, reliance on
                        the service as financial advice, or temporary service
                        interruptions. Nothing in these terms limits a right
                        or liability that applicable law does not allow us to
                        limit.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        10. Changes to these terms
                    </h2>
                    <p>
                        We may update these terms as the service or applicable
                        requirements change. We will post the updated terms
                        here and revise the date above. If a change materially
                        affects your use, we will provide notice when
                        appropriate. Continued use after updated terms take
                        effect means you accept them where applicable law
                        permits.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        11. Contact
                    </h2>
                    <p>
                        For questions about these terms, contact Truvora at{" "}
                        {supportEmail ? (
                            <a
                                className="text-primary underline underline-offset-4"
                                href={`mailto:${supportEmail}`}
                            >
                                {supportEmail}
                            </a>
                        ) : (
                            "Support contact details will be published here."
                        )}
                        {supportEmail && "."}
                    </p>
                </section>
            </div>
        </article>
    );
}
