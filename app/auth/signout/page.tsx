"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export default function Signout() {
    const { signOut } = useClerk();
    useEffect(() => {
        const logout = async () => {
            // Let Clerk perform the navigation after clearing the session.
            // A client router push here can race with Clerk's own state update.
            await signOut({ redirectUrl: "/" });
        };

        logout();
    }, [signOut]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <p>Signing out...</p>
        </div>
    );
}
