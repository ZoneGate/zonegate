"use client";

import { useEffect, useState } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function Shell({ children }: { children: React.ReactNode }) {
    const [navOpen, setNavOpen] = useState(false);

    // Lock body scroll while the mobile drawer is open.
    useEffect(() => {
        document.body.style.overflow = navOpen ? "hidden" : "";

        return () => {
            document.body.style.overflow = "";
        };
    }, [navOpen]);

    // Escape closes the drawer.
    useEffect(() => {
        if (!navOpen) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setNavOpen(false);
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [navOpen]);

    return (
        <>
            <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

            <div className="min-h-screen lg:ml-64">
                <Header onMenuClick={() => setNavOpen(true)} />

                <main className="min-h-screen bg-[#F8FAFC] px-4 pb-6 pt-20 sm:px-6">
                    {children}
                </main>
            </div>
        </>
    );
}
