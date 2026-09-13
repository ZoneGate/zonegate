"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import { listDecisions } from "@/lib/api";

/**
 * The one dashboard tile backed by the live policy engine: how many actions
 * are currently waiting on a human authority.
 */
export default function HoldMetricCard() {
    const [pending, setPending] = useState<number | null>(null);
    const [reachable, setReachable] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const poll = () => {
            listDecisions({ decision: "HOLD", pending: true, limit: 200 })
                .then((holds) => {
                    if (cancelled) return;
                    setPending(holds.length);
                    setReachable(true);
                })
                .catch(() => {
                    if (cancelled) return;
                    setReachable(false);
                });
        };

        poll();
        const id = window.setInterval(poll, 15000);

        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);

    return (
        <div className="h-full rounded-lg border border-[#E2E8F0] bg-white p-4 transition hover:border-[#0D9488]">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                    On Hold
                </span>

                <span className="text-[#64748B]">
                    <Clock3 size={18} />
                </span>
            </div>

            <p className="mt-3 text-2xl font-semibold tabular-nums text-[#0F172A]">
                {reachable ? pending ?? "—" : "—"}
            </p>

            <p className="mt-1 text-xs text-[#94A3B8]">
                {reachable ? "Awaiting your decision →" : "Policy engine unreachable"}
            </p>
        </div>
    );
}
