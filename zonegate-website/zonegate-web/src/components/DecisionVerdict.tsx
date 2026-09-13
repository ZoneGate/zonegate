"use client";

/**
 * What happened to this request, said once, at the top, in the colour of the
 * answer.
 *
 * Reading a decision used to mean finding the badge, then finding the reason
 * in a panel further down, then finding the human's note in a panel further
 * down still. This puts the three together: the outcome, the sentence the
 * policy engine gave for it, and — once a person has decided — what they wrote
 * when they did.
 *
 * A HOLD nobody has answered yet is deliberately not green or red. It has no
 * result to report; it is waiting for one.
 */

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { PolicyDecision } from "@/lib/api";
import { effectiveOutcome, isAwaitingAuthority, shortStamp } from "@/lib/derive";

const TONES = {
    APPROVE: {
        box: "border-[#99F6E4] bg-[#F0FDFA]",
        heading: "text-[#0F766E]",
        body: "text-[#115E59]",
        Icon: CheckCircle2,
    },
    DENY: {
        box: "border-[#FECACA] bg-[#FEF2F2]",
        heading: "text-[#B91C1C]",
        body: "text-[#991B1B]",
        Icon: XCircle,
    },
    PENDING: {
        box: "border-[#FDE68A] bg-[#FFFBEB]",
        heading: "text-[#B45309]",
        body: "text-[#92400E]",
        Icon: Clock,
    },
} as const;

export default function DecisionVerdict({ decision }: { decision: PolicyDecision }) {
    const awaiting = isAwaitingAuthority(decision);
    const outcome = effectiveOutcome(decision);
    const resolution = decision.resolution;

    const tone = awaiting ? TONES.PENDING : TONES[outcome === "APPROVE" ? "APPROVE" : "DENY"];
    const { Icon } = tone;

    const heading = awaiting
        ? `AWAITING ${decision.required_authority ?? "AN AUTHORITY"}`
        : outcome === "APPROVE"
          ? "RELEASE AUTHORIZED"
          : "RELEASE REFUSED";

    return (
        <section
            role="status"
            className={`flex items-start gap-3 rounded-lg border px-4 py-4 ${tone.box}`}
        >
            <Icon size={22} className={`mt-0.5 shrink-0 ${tone.heading}`} aria-hidden />

            <div className="min-w-0">
                <p className={`text-sm font-semibold uppercase tracking-wide ${tone.heading}`}>
                    {heading}
                </p>

                {/* The reason the engine gave, verbatim. Later reasons, if any,
                    stay in the Policy Outcome panel rather than crowding this. */}
                <p className={`mt-1.5 text-sm leading-relaxed ${tone.body}`}>
                    {decision.reasons[0] ?? "No reason was recorded for this decision."}
                </p>

                {resolution ? (
                    <div className={`mt-3 border-t pt-3 text-sm leading-relaxed ${tone.body} border-current/20`}>
                        <p>
                            <span className="font-semibold">
                                {resolution.outcome === "APPROVE" ? "Approved" : "Denied"}
                            </span>{" "}
                            by {resolution.resolved_by} ({resolution.authority_role}) on{" "}
                            {shortStamp(resolution.resolved_at)}.
                        </p>

                        {/* The note the deciding person wrote. It is the only
                            account of *why* a human overrode the queue, so it
                            belongs with the verdict, not three panels away. */}
                        {resolution.note ? (
                            <p className="mt-1.5 italic">&ldquo;{resolution.note}&rdquo;</p>
                        ) : (
                            <p className="mt-1.5 opacity-70">No note was recorded with this decision.</p>
                        )}
                    </div>
                ) : (
                    awaiting && (
                        <p className={`mt-2 text-xs ${tone.body} opacity-80`}>
                            Nothing is released while this is open. The named authority
                            decides on the same evidence the engine used.
                        </p>
                    )
                )}
            </div>
        </section>
    );
}
