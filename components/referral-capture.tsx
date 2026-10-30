"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const REFERRAL_PLATFORM_KEY = "truvora.referral-platform";

export default function ReferralCapture() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const referralPlatform = searchParams
            .get("ref")
            ?.trim()
            .toLowerCase()
            .slice(0, 64);

        if (referralPlatform) {
            window.sessionStorage.setItem(REFERRAL_PLATFORM_KEY, referralPlatform);
        }
    }, [searchParams]);

    return null;
}
