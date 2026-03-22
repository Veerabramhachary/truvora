"use client";

import { useRouter } from "next/navigation";

export default function SelectProviderContent() {
    const router = useRouter();

    const handleCheckout = async (priceId: string) => {
        router.push(`/app/checkout?priceId=${priceId}`);
    };

    return <div>Page</div>;
}
