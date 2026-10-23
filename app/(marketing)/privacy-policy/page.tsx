import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "How Truvora collects, uses and protects your information.",
};

export default function PrivacyPolicyPage() {
    return (
        <article className="mx-auto w-full max-w-3xl px-6 py-16">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
                Last updated: October 2026
            </p>

            <div className="mt-10 space-y-8 text-base leading-relaxed text-muted-foreground">
                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        1. What we collect
                    </h2>
                    <p>
                        Truvora stores the financial records you choose to
                        enter — transactions, expenses, subscription details and
                        categories — together with the account information
                        needed to sign you in (your name, email address and
                        authentication identifier).
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        2. How we use it
                    </h2>
                    <p>
                        We use your data to run the product: showing your
                        dashboards, enforcing the limits of your plan, and
                        sending the notifications you have asked for — such as
                        reminders ahead of a subscription renewal. We do not sell
                        your data.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        3. Sensitive fields
                    </h2>
                    <p>
                        Free-text fields such as descriptions and notes are
                        encrypted at rest before they are written to the
                        database, so they are never stored as readable text.
                        Encryption keys are held separately from the data
                        itself.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        4. Who processes it
                    </h2>
                    <p>
                        We rely on a small number of infrastructure providers to
                        deliver the service — hosting and database, email
                        delivery, and authentication. Each is given only the
                        access it needs to do its job.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        5. Retention and deletion
                    </h2>
                    <p>
                        We keep your data for as long as your account exists.
                        Deleting your account removes your records from the
                        product; encrypted free-text fields are unrecoverable
                        without the keys, which are discarded alongside them.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        6. Your rights
                    </h2>
                    <p>
                        You can request a copy of your data or ask us to delete
                        it at any time. Depending on where you live, local law
                        may give you additional rights over that information.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        7. Changes to this policy
                    </h2>
                    <p>
                        We will update this page as the service changes and
                        revise the date above when we do.
                    </p>
                </section>

                <section>
                    <h2 className="mb-3 text-xl font-semibold text-foreground">
                        8. Contact
                    </h2>
                    <p>
                        Privacy questions can be raised from within your account
                        settings, or see our{" "}
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
