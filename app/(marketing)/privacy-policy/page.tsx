import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "How Truvora collects, uses and protects personal data in India.",
};

export default function PrivacyPolicyPage() {
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

    return (
        <article className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
                Last updated: October 25, 2026
            </p>

            <div className="mt-10 space-y-8 text-base leading-relaxed text-muted-foreground">
                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        About this policy
                    </h2>
                    <p>
                        This policy explains how Truvora handles personal data
                        when people in India use our personal finance tracking
                        service. It is intended to be read with applicable
                        Indian law, including the Information Technology Act,
                        2000 and the Information Technology (Reasonable Security
                        Practices and Procedures and Sensitive Personal Data or
                        Information) Rules, 2011. The Digital Personal Data
                        Protection Act, 2023 and its rules have a staged
                        commencement. We will apply their requirements as they
                        come into force and update this policy when needed.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Data we collect
                    </h2>
                    <p>
                        We collect account details supplied by our sign-in
                        provider, such as your email address, name and account
                        identifier. We also store the financial information you
                        choose to enter, including transaction and expense
                        names, amounts, dates, currencies, categories,
                        descriptions, notes, subscription details and renewal
                        dates. Financial information may be sensitive personal
                        data or information under applicable Indian rules.
                    </p>
                    <p className="mt-3">
                        We create service records such as your selected plan,
                        feature usage and renewal-reminder delivery status. Our
                        hosting and security providers may process technical
                        information needed to deliver and protect the service.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        How we use data
                    </h2>
                    <p>
                        We use data to create and secure your account, save and
                        display your records, prepare reports and exports,
                        enforce plan limits, deliver account messages, provide
                        renewal reminders when email delivery is available,
                        respond to support requests, prevent misuse, and meet
                        legal obligations. We do not sell personal data or use
                        your financial records for advertising.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Service providers and disclosures
                    </h2>
                    <p>
                        We use providers for authentication, hosting and
                        database storage. Authentication emails are handled by
                        our sign-in provider. Renewal reminders may be sent
                        through an email delivery provider when that feature is
                        configured; we may change providers over time. While
                        renewal email delivery is being set up, reminders may
                        not be available. Providers process data only as
                        needed to provide services to us. We may disclose data
                        where required by law or a valid legal process, or
                        where necessary to protect the service, users or the
                        public. Providers may process data in locations outside
                        India; where this happens, we will make transfers only
                        as permitted by applicable law and subject to
                        appropriate contractual safeguards.
                    </p>
                    <p className="mt-3">
                        Truvora does not currently accept payments through
                        Stripe or collect payment card details. We will update
                        this policy before introducing paid checkout or another
                        payment provider.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Security and encryption
                    </h2>
                    <p>
                        We use application-managed AES-256-GCM encryption for
                        financial names, descriptions, notes, metadata and
                        invoice line details stored in our database. Amounts,
                        dates, currencies, categories, account identifiers,
                        usage counts and billing totals are not encrypted at
                        the application layer. We also rely on safeguards
                        provided by our infrastructure providers. No method of
                        storage or transmission can be guaranteed completely
                        secure.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Retention and deletion
                    </h2>
                    <p>
                        We keep account and financial records while your
                        account is active. You can delete your account from
                        Settings; this removes your financial records,
                        categories, usage data and account identifiers from our
                        active database. Limited billing records may be
                        retained without account or provider identifiers where
                        needed for legal, accounting or fraud-prevention
                        purposes. Backup copies may remain until they are
                        rotated out, and our providers may retain data under
                        their own legal obligations and policies.
                    </p>
                    <p className="mt-3">
                        We do not intend the service for anyone under 18. If you
                        believe a person under 18 has provided personal data to
                        Truvora, contact us so we can review and delete it where
                        appropriate.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Your requests and grievances
                    </h2>
                    <p>
                        You may ask us to provide access to, correct or erase
                        your personal data, or raise a privacy grievance. We
                        will handle requests under the laws applicable to the
                        request. You may withdraw consent where processing is
                        based on consent; this may affect features that need
                        that data. You can also delete your account in Settings.
                    </p>
                    <p className="mt-3">
                        Contact our privacy and grievance support at{" "}
                        {supportEmail ? (
                            <a
                                className="text-primary underline underline-offset-4"
                                href={`mailto:${supportEmail}`}
                            >
                                {supportEmail}
                            </a>
                        ) : (
                            "the support email published by Truvora"
                        )}
                        . We will acknowledge and address grievances within
                        timelines required by applicable law.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Changes and related terms
                    </h2>
                    <p>
                        We may update this policy as the service or applicable
                        law changes. We will post the revised policy here and
                        change the date above. See our{" "}
                        <a
                            href="/terms"
                            className="text-primary underline underline-offset-4"
                        >
                            Terms of Service
                        </a>
                        .
                    </p>
                </section>
            </div>
        </article>
    );
}
