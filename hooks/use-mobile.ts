"use client";

import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/*
  `useSyncExternalStore` rather than useState + an effect that calls setState:
  media queries are an external store, and reading them in an effect body is
  a synchronously-caused cascading render. This also gives React a server
  snapshot, so SSR and the first client render agree instead of mismatching.
*/
function subscribe(onChange: () => void) {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
    return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
    return false;
}

export function useIsMobile() {
    return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
