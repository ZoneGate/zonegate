import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";

import { evidenceCheck, type PlanOutline } from "@/lib/evidence";

const TONE = {
    pass: { Icon: CheckCircle2, colour: "text-[#0F766E]", spoken: "passed" },
    fail: { Icon: XCircle, colour: "text-[#B91C1C]", spoken: "failed" },
    none: { Icon: MinusCircle, colour: "text-[#94A3B8]", spoken: "no result" },
} as const;

/**
 * One network evidence check: a tick, a cross or a dash, and what the carrier
 * reported in a short line underneath.
 */
export default function EvidenceRow({
    label,
    kind,
    state,
    plan,
}: {
    label: string;
    kind: string;
    state: boolean | null | undefined;
    plan?: PlanOutline | null;
}) {
    const { tone, detail } = evidenceCheck(kind, state, plan);
    const { Icon, colour, spoken } = TONE[tone];

    return (
        <div className="flex items-start gap-2.5 py-1.5">
            <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${colour}`} />

            <div className="min-w-0">
                <p className="text-sm text-[#0F172A]">
                    {label}
                    <span className="sr-only">: {spoken}</span>
                </p>
                <p className="text-xs leading-snug text-[#64748B]">{detail}</p>
            </div>
        </div>
    );
}
