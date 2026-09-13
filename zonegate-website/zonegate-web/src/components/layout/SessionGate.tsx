"use client";

/**
 * Decides whether the console is reachable at all.
 *
 * ZoneGate registers nobody here. An operator signs in against an identity that
 * is already on the enrolled roster; until the backend confirms a session, the
 * sign-in screen is the entire application.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, getSession, logout as endSession, type Actor } from "@/lib/api";
import LoginScreen from "@/components/LoginScreen";

type SessionState = {
    actor: Actor;
    signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/** The signed-in operator. Only callable beneath SessionGate, which guarantees one. */
export function useSession(): SessionState {
    const value = useContext(SessionContext);
    if (!value) throw new Error("useSession was called outside a signed-in console");
    return value;
}

export default function SessionGate({ children }: { children: React.ReactNode }) {
    const [actor, setActor] = useState<Actor | null>(null);
    const [checking, setChecking] = useState(true);
    const [unreachable, setUnreachable] = useState<string | null>(null);

    const check = useCallback(async () => {
        try {
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new ApiError("Session probe timed out (backend unreachable)", 0)), 3000)
            );
            const session = await Promise.race([getSession(), timeout]);
            setActor(session.actor);
            setUnreachable(null);
        } catch (caught) {
            setActor(null);
            // A 401 is the ordinary "nobody is signed in"; anything else means
            // the backend could not answer, which is a different message.
            setUnreachable(
                caught instanceof ApiError && caught.status !== 401 ? caught.message : null
            );
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        check();
    }, [check]);

    const signOut = useCallback(async () => {
        try {
            await endSession();
        } finally {
            setActor(null);
        }
    }, []);

    if (checking) {
        return (
            <div role="status" className="flex min-h-screen items-center justify-center bg-white">
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#94A3B8]">
                    Verifying session…
                </p>
            </div>
        );
    }

    if (!actor) {
        return <LoginScreen unreachable={unreachable} onSignedIn={setActor} />;
    }

    return (
        <SessionContext.Provider value={{ actor, signOut }}>
            {children}
        </SessionContext.Provider>
    );
}
