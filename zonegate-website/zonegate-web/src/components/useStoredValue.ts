"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads a localStorage entry once per session.
 *
 * The server snapshot is null so the prerendered HTML matches; the client
 * returns the stored string on hydration. Callers key a component on the
 * result rather than copying it into state from an effect.
 */
function noopSubscribe() {
    return () => { };
}

export function useStoredValue(key: string) {
    return useSyncExternalStore(
        noopSubscribe,
        () => {
            try {
                return window.localStorage.getItem(key);
            } catch {
                return null;
            }
        },
        () => null
    );
}
