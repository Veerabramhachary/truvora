"use client";

import React, { ReactElement, useEffect, useState } from "react";

interface GateChildProps {
    disabled?: boolean;
    className?: string;
}

interface FeatureGateProps {
    feature: string;
    children: ReactElement<GateChildProps>;
    quantity?: number;
}

export function FeatureGate({
    feature,
    children,
    quantity = 1,
}: FeatureGateProps) {
    const [allowed, setAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const params = new URLSearchParams({
            feature,
            quantity: String(quantity),
        });

        fetch(`/api/feature?${params.toString()}`, {
            signal: controller.signal,
        })
            .then((res) => res.json())
            .then((data) => setAllowed(data.allowed))
            .catch(() => setAllowed(false));

        return () => controller.abort();
    }, [feature, quantity]);

    if (allowed === null) return children;

    if (!allowed) {
        return (
            <div
                title={`Upgrade plan to use ${feature}`}
                className="inline-block cursor-not-allowed"
            >
                {React.cloneElement(children, {
                    disabled: true,
                    className: `${children.props.className ?? ""} opacity-50 cursor-not-allowed`,
                })}
            </div>
        );
    }

    return children;
}
