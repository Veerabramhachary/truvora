"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SettingsContent() {
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function deleteAccount() {
        if (!window.confirm("Delete your Truvora account and personal financial data? This cannot be undone.")) return;
        setDeleting(true);
        setError(null);
        try {
            const response = await fetch("/api/account", { method: "DELETE" });
            if (!response.ok) throw new Error("Could not delete your account. Please contact support.");
            router.replace("/");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not delete your account.");
            setDeleting(false);
        }
    }

    return <section className="mx-auto w-full max-w-3xl space-y-8 px-6 py-12">
        <header><Settings2 className="mb-3 size-6 text-muted-foreground" /><h1 className="text-3xl font-semibold">Settings</h1><p className="mt-2 text-muted-foreground">Manage your account and personal data.</p></header>
        <div className="rounded-lg border p-6">
            <h2 className="text-lg font-medium">Delete account</h2>
            <p className="mt-2 text-sm text-muted-foreground">This permanently removes your account, financial records and usage data. Limited billing totals may be retained without account or provider identifiers where required.</p>
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}{process.env.NEXT_PUBLIC_SUPPORT_EMAIL && <> <a className="underline" href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>Contact support.</a></>}</p>}
            <Button variant="destructive" className="mt-4" onClick={deleteAccount} disabled={deleting}>
                <Trash2 />{deleting ? "Deleting…" : "Delete my account"}
            </Button>
        </div>
    </section>;
}
