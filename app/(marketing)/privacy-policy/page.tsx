import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "How Truvora collects, uses and protects your information.",
};

export default function PrivacyPolicyPage() {
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    return (
        <article className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
            <p className="mt-3 text-sm text-muted-foreground">Last updated: October 2026</p>
            <div className="mt-10 space-y-8 text-base leading-relaxed text-muted-foreground">
                <section><h2 className="mb-3 text-xl font-semibold text-foreground">Information we store</h2><p>Truvora stores the financial records you enter, including transaction and expense titles, amounts, dates, categories, descriptions, subscription names and renewal details. We also store account identifiers, name and email from our authentication provider, plan and subscription state, usage counts, and billing records needed to operate and support paid plans. Our providers (authentication, hosting, database, payment processing and email delivery) process information as needed to provide their services.</p></section>
                <section><h2 className="mb-3 text-xl font-semibold text-foreground">Encryption and use</h2><p>We encrypt financial titles, subscription names, descriptions, notes, metadata and invoice line details in the database using application-managed AES-256-GCM encryption. Amounts, dates, currencies, categories, account identifiers, usage counts and billing totals are not encrypted at the application layer. We use information to provide the product, enforce plan limits, process payments, provide support and send renewal reminders. We do not sell personal information.</p></section>
                <section><h2 className="mb-3 text-xl font-semibold text-foreground">Retention and account deletion</h2><p>Account and financial data is retained while your account is active. You can request deletion using the account deletion control in your account or contact support if you cannot access the account. Deletion removes financial records, categories, usage data and account identifiers from our active database. We retain only billing totals and associated dates/currency where needed for accounting, tax, fraud prevention or legal obligations; these records are unlinked from your account and have provider identifiers and invoice detail removed. Backup copies may persist until normal backup rotation. Payment providers may retain records under their own legal and retention policies.</p></section>
                <section><h2 className="mb-3 text-xl font-semibold text-foreground">Your choices and contact</h2><p>You may request access, correction or deletion of your information, subject to applicable law. For assistance, email {supportEmail ? <a className="text-primary underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> : "the support address published by Truvora"}. The privacy rights and retention periods that apply depend on your location; this policy and the Terms of Service should be reviewed for the countries and age groups in which Truvora is offered.</p></section>
                <section><h2 className="mb-3 text-xl font-semibold text-foreground">Policy changes</h2><p>We may update this policy as the service changes. We will revise the date above when we do.</p></section>
                <section><h2 className="mb-3 text-xl font-semibold text-foreground">Related terms</h2><p>See our <a href="/terms" className="text-primary underline underline-offset-4">Terms of Service</a>.</p></section>
            </div>
        </article>
    );
}
