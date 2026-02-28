"use client";

import { AuthProvider } from "@refinedev/core";
import { useAuth, useClerk } from "@clerk/nextjs";

export const useClerkAuthProvider = (): AuthProvider => {
    const { isSignedIn, userId, isLoaded } = useAuth();
    const { signOut } = useClerk();

    return {
        login: async () => ({
            success: true,
        }),

        logout: async () => {
            await signOut();
            return {
                success: true,
                redirectTo: "/auth/sign-in",
            };
        },

        check: async () => {
            if (!isLoaded) {
                return {
                    authenticated: false,
                };
            }

            if (isSignedIn) {
                return {
                    authenticated: true,
                };
            }

            return {
                authenticated: false,
                redirectTo: "/auth/sign-in",
            };
        },

        getIdentity: async () => {
            if (!isSignedIn) return null;

            return {
                id: userId!,
            };
        },

        getPermissions: async () => null,

        onError: async (error) => {
            console.error(error);
            return { error };
        },
    };
};