import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "What personal data Truvora handles, why it is used, and how to manage it.",
};

export default function PrivacyPolicyPage() {
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

    return (
        <article className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
                Last updated: October 26, 2026
            </p>

            <div className="mt-10 space-y-8 text-base leading-relaxed text-muted-foreground">
                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        About this policy
                    </h2>
                    <p>
                        This policy describes how Truvora handles personal data
                        when people in India use our personal finance tracking
                        service. It should be read with applicable Indian law,
                        including the Information Technology Act, 2000, the
                        Information Technology (Reasonable Security Practices
                        and Procedures and Sensitive Personal Data or
                        Information) Rules, 2011, and the Digital Personal Data
                        Protection Act, 2023 and its rules. The DPDP Act and
                        Rules have a phased commencement, with remaining
                        provisions scheduled to take effect through May 2027.
                        We will meet the requirements that apply to us as they
                        take effect.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Data we collect
                    </h2>
                    <p>
                        We receive account details from our sign-in provider,
                        including your email address, name, profile image and
                        account identifier. We store the financial records you
                        enter, such as expense and transaction names, amounts,
                        dates, currencies, categories, descriptions, notes,
                        subscription names, prices, schedules and renewal dates.
                        Some financial information may be treated as sensitive
                        personal data under applicable law, depending on what it
                        contains and which rules apply.
                    </p>
                    <p className="mt-3">
                        We also keep service records such as your selected
                        product plan, feature usage and renewal-reminder
                        delivery status. Our service providers may process
                        technical information, such as request and security
                        logs, to operate and protect the service. When a
                        renewal reminder is sent, the email delivery provider
                        receives the recipient email address and reminder
                        content, including the subscription name and renewal
                        timing.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        How we use data
                    </h2>
                    <p>
                        We use this information to create and secure your
                        account, save and display your records, prepare reports
                        and exports, apply plan limits, send account and
                        renewal messages, provide support, prevent misuse, and
                        meet legal obligations. We do not sell your personal
                        data or use your financial records for advertising.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Cookies and session technologies
                    </h2>
                    <p>
                        Our sign-in provider uses cookies or similar
                        technologies to keep your account session secure and
                        remember that you are signed in. Blocking these
                        technologies may prevent sign-in or other core account
                        features from working.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Service providers and disclosures
                    </h2>
                    <p>
                        We use service providers for account authentication,
                        hosting, database storage, email delivery and service
                        security. Authentication and verification emails are
                        handled by our sign-in provider. Renewal reminders are
                        sent through an email delivery provider when reminders
                        are enabled. We may change providers as the service
                        evolves. Providers process information to provide
                        services to Truvora, under their applicable terms and
                        privacy practices. We may also disclose information
                        when required by law or valid legal process, or when
                        reasonably necessary to protect the service, users or
                        the public. Depending on the provider, information may
                        be processed outside India.
                    </p>
                    <p className="mt-3">
                        Paid checkout is currently disabled. Truvora does not
                        collect payment card details for in-app purchases. If
                        payment processing becomes available, we will update
                        this policy to explain what information is shared and
                        with whom before accepting payments.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Security and encryption
                    </h2>
                    <p>
                        We use application-managed AES-256-GCM encryption for
                        selected fields stored in our database, including
                        expense, transaction and subscription names; notes and
                        descriptions; and selected payment transaction error
                        messages and metadata, invoice metadata and invoice
                        line details. This does not cover every field.
                        Account email addresses, profile details, identifiers,
                        amounts, dates, currencies, categories, usage counts
                        and billing totals are not encrypted at the application
                        layer. We also rely on safeguards provided by our
                        infrastructure providers. No storage or transmission
                        method can be guaranteed completely secure.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Retention and deletion
                    </h2>
                    <p>
                        We keep account and financial records while your
                        account is active. You can request account deletion in
                        Settings. When deletion is processed, we remove your
                        account, financial records, categories, feature usage
                        and renewal-reminder delivery records from our active
                        database. If billing records exist, limited totals,
                        currencies, statuses and dates may be retained after
                        account and provider identifiers and invoice details
                        are removed, where needed for accounting or fraud
                        prevention. Copies in backups and provider operational
                        logs may remain temporarily under the applicable
                        retention schedules.
                    </p>
                    <p className="mt-3">
                        Truvora is not intended for anyone under 18. If you
                        believe a person under 18 has provided personal data to
                        Truvora, contact us using the details below so we can
                        review the request.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        Your requests and grievances
                    </h2>
                    <p>
                        You can ask us to access, correct or delete personal
                        data, raise a privacy concern, or withdraw consent
                        where processing is based on consent. Some requests may
                        affect your ability to use features that need the data.
                        You can also start account deletion from Settings. We
                        will handle requests under the laws and timelines that
                        apply.
                    </p>
                    <p className="mt-3">
                        Contact Truvora about privacy requests or grievances at{" "}
                        {supportEmail ? (
                            <a
                                className="text-primary underline underline-offset-4"
                                href={`mailto:${supportEmail}`}
                            >
                                {supportEmail}
                            </a>
                        ) : (
                            "Privacy and grievance contact details will be published here."
                        )}
                        {supportEmail && (
                            <>. Please include enough information for us to understand and respond to your request.</>
                        )}
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
