"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Signout() {
    const { signOut } = useClerk();
    const router = useRouter();
    useEffect(() => {
        const logout = async () => {
            await signOut();
            router.push("/"); // Redirect after sign out
        };

        logout();
    }, [signOut, router]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <p>Signing out...</p>
        </div>
    );
}
