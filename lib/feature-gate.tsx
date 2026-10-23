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

/*
  Feature answers are cached module-wide and in-flight requests are shared.

  Each <FeatureGate> used to fire its own fetch, so a page with two gates made
  two identical round trips — and React StrictMode's double-invoked effect made
  it four in development, with the aborted first attempt flipping `allowed` to
  false in between.

  The TTL is deliberately short: it exists to collapse the burst of requests a
  single render produces, not to hold an answer across a plan change. Consuming
  a subscription or upgrading should reflect within a few seconds at worst.
*/
const TTL_MS = 5_000;
const FAILURE_TTL_MS = 2_000;

type CacheEntry = { allowed: boolean; expires: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<boolean>>();

function getFeatureAllowed(
    feature: string,
    quantity: number,
): Promise<boolean> {
    const key = `${feature}:${quantity}`;

    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
        return Promise.resolve(hit.allowed);
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    const params = new URLSearchParams({
        feature,
        quantity: String(quantity),
    });

    const request = fetch(`/api/feature?${params.toString()}`)
        .then(async (res) => {
            const data = await res.json().catch(() => null);
            // A non-2xx must not be cached as "allowed" — /api/feature now
            // returns 400 for an unknown feature name.
            const allowed = Boolean(res.ok && data?.allowed);
            cache.set(key, { allowed, expires: Date.now() + TTL_MS });
            return allowed;
        })
        .catch(() => {
            // Cache failures briefly too, so a flaky connection doesn't
            // retrigger a request from every gate on the page at once.
            cache.set(key, {
                allowed: false,
                expires: Date.now() + FAILURE_TTL_MS,
            });
            return false;
        })
        .finally(() => {
            inflight.delete(key);
        });

    inflight.set(key, request);
    return request;
}

export function FeatureGate({
    feature,
    children,
    quantity = 1,
}: FeatureGateProps) {
    const [allowed, setAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        getFeatureAllowed(feature, quantity).then((value) => {
            if (!cancelled) setAllowed(value);
        });
        return () => {
            cancelled = true;
        };
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
