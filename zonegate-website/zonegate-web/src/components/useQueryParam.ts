"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads a query-string parameter without suspending the route.
 *
 * `useSearchParams` puts the whole page behind a Suspense boundary that never
 * resolves for these statically prerendered routes, so the value is read from
 * `location` instead. The server snapshot is empty, which matches the
 * prerendered HTML; the client fills in the real value on hydration.
 */
export const QUERY_CHANGE_EVENT = "zonegate:querychange";

function subscribe(onChange: () => void) {
    window.addEventListener("popstate", onChange);
    window.addEventListener(QUERY_CHANGE_EVENT, onChange);

    return () => {
        window.removeEventListener("popstate", onChange);
        window.removeEventListener(QUERY_CHANGE_EVENT, onChange);
    };
}

export function useQueryParam(name: string) {
    return useSyncExternalStore(
        subscribe,
        () => new URLSearchParams(window.location.search).get(name) ?? "",
        () => ""
    );
}

/**
 * The App Router navigates with `history.pushState`, which fires neither
 * `hashchange` nor `popstate`, so those two events alone miss every in-app
 * link. Rather than wrapping `history` — a global patch that ends up running
 * inside React's own navigation effect — the hash is simply observed.
 *
 * The poll is the fallback that catches soft navigations; the two events keep
 * back/forward and address-bar edits instant.
 */
function subscribeToHash(onChange: () => void) {
    let last = window.location.hash;

    const check = () => {
        const current = window.location.hash;
        if (current === last) return;

        last = current;
        onChange();
    };

    window.addEventListener("hashchange", check);
    window.addEventListener("popstate", check);
    const id = window.setInterval(check, 120);

    return () => {
        window.removeEventListener("hashchange", check);
        window.removeEventListener("popstate", check);
        window.clearInterval(id);
    };
}

/**
 * The current location hash without its `#`, kept in sync with in-page
 * navigation. Empty on the server so the prerendered markup matches.
 */
export function useHash() {
    return useSyncExternalStore(
        subscribeToHash,
        () => window.location.hash.replace(/^#/, ""),
        () => ""
    );
}
