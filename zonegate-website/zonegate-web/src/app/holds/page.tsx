"use client";

import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    Clock,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
    ApiError,
    DecisionContext,
    PolicyDecision,
    getDecisionContext,
    listDecisions,
    resolveHold,
} from "@/lib/api";
import { useSession } from "@/components/layout/SessionGate";
import { holdsAuthority } from "@/lib/roles";
import EvidenceRow from "@/components/EvidenceRow";

const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});

function formatUtc(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;

    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
        date.getUTCDate()
    )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export default function HoldsPage() {
    // The resolution is recorded under whoever is signed in to the console,
    // so the audit trail names the person who actually decided.
    const { actor } = useSession();
    const [holds, setHolds] = useState<PolicyDecision[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    // Bumping this re-runs the fetch; state is only set from its callbacks.
    const [reloadToken, setReloadToken] = useState(0);

    const reload = () => {
        setLoading(true);
        setReloadToken((current) => current + 1);
    };

    useEffect(() => {
        let cancelled = false;

        listDecisions({ decision: "HOLD", pending: true, limit: 200 })
            .then((pending) => {
                if (cancelled) return;
                setHolds(pending);
                setError(null);
            })
            .catch((caught) => {
                if (cancelled) return;
                setError(
                    caught instanceof ApiError
                        ? caught.message
                        : "Unexpected error loading the hold queue"
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    useEffect(() => {
        if (!toast) return;

        const id = window.setTimeout(() => setToast(null), 3200);
        return () => window.clearTimeout(id);
    }, [toast]);

    if (openId) {
        return (
            <HoldReview
                decisionId={openId}
                toast={toast}
                onBack={() => setOpenId(null)}
                onResolved={(message) => {
                    setToast(message);
                    setOpenId(null);
                    reload();
                }}
            />
        );
    }

    return (
        <div className="flex w-full flex-col gap-6">
            {toast && (
                <div
                    role="status"
                    className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded border border-[#0D9488]/40 bg-[#0F172A] px-4 py-2.5 font-mono text-[11px] text-white shadow-lg"
                >
                    {toast}
                </div>
            )}

            <section className="flex flex-col justify-between gap-4 rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 lg:flex-row lg:items-end">
                <div>
                    <div className="mb-1 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#D97706]" />
                        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#64748B]">
                            Authority Transfer {"//"} Awaiting Human Decision
                        </span>
                    </div>

                    <h1 className="text-2xl font-semibold uppercase tracking-[-0.03em] text-[#0F172A] sm:text-3xl">
                        Hold Queue
                    </h1>

                    <p className="mt-2 max-w-3xl text-sm text-[#64748B]">
                        The policy engine held these actions and handed the decision to a
                        named authority. You decide on the same evidence package the engine
                        used. A deterministic DENY never reaches this queue.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={reload}
                    className="flex w-fit items-center gap-2 rounded border border-[#E2E8F0] bg-white px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#0F172A] transition hover:border-[#0D9488] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                >
                    <RefreshCw size={15} className="text-[#64748B]" />
                    Refresh Queue
                </button>
            </section>

            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#DC2626]" />

                    <div>
                        <p className="text-sm font-semibold text-[#B91C1C]">
                            Authorization API unavailable
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-[#B91C1C]">
                            {error}
                        </p>
                    </div>
                </div>
            )}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <QueueTile
                    label="Awaiting Decision"
                    value={loading ? "—" : String(holds.length)}
                    meta="Handed over by policy"
                    icon={<Clock size={17} />}
                />

                <QueueTile
                    label="Cargo Supervisor"
                    value={
                        loading
                            ? "—"
                            : String(
                                holds.filter(
                                    (hold) => hold.required_authority === "ROLE_CARGO_SUPERVISOR"
                                ).length
                            )
                    }
                    meta="ROLE_CARGO_SUPERVISOR"
                    icon={<ShieldCheck size={17} />}
                />

                <QueueTile
                    label="Security Officer"
                    value={
                        loading
                            ? "—"
                            : String(
                                holds.filter(
                                    (hold) => hold.required_authority === "ROLE_SECURITY_OFFICER"
                                ).length
                            )
                    }
                    meta="ROLE_SECURITY_OFFICER"
                    icon={<ShieldAlert size={17} />}
                />

                <QueueTile
                    label="Acting As"
                    value={actor.actor_id}
                    meta={actor.role}
                    icon={<CheckCircle2 size={17} />}
                />
            </section>

            <section className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3.5">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0F172A]">
                        Pending Authority Transfers
                    </span>

                    <span className="font-mono text-[10px] text-[#64748B]">
                        LIVE FROM POLICY ENGINE
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9] font-mono text-[10px] uppercase tracking-wider text-[#64748B]">
                                {[
                                    "Decision ID",
                                    "Transaction",
                                    "Required Authority",
                                    "Policy Reason",
                                    "Held At",
                                    "Review",
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        className="px-5 py-3 font-semibold last:text-right"
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-[#E2E8F0] text-xs">
                            {holds.map((hold) => (
                                <tr
                                    key={hold.decision_id}
                                    onClick={() => setOpenId(hold.decision_id)}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`Review hold ${hold.decision_id}`}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setOpenId(hold.decision_id);
                                        }
                                    }}
                                    className="cursor-pointer transition hover:bg-[#FFFBEB] focus:outline-none focus-visible:bg-[#FFFBEB] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0D9488]"
                                >
                                    <td className="whitespace-nowrap px-5 py-4 font-mono text-[11px] font-medium">
                                        {hold.decision_id}
                                    </td>

                                    <td className="whitespace-nowrap px-5 py-4 font-mono text-[11px] text-[#64748B]">
                                        {hold.transaction_id}
                                    </td>

                                    <td className="whitespace-nowrap px-5 py-4">
                                        <span className="rounded border border-[#FEF3C7] bg-[#FFFBEB] px-2 py-1 font-mono text-[10px] font-semibold text-[#B45309]">
                                            {hold.required_authority ?? "UNASSIGNED"}
                                        </span>
                                    </td>

                                    <td className="max-w-[380px] px-5 py-4 text-[#0F172A]">
                                        {hold.reasons[0]}
                                    </td>

                                    <td className="whitespace-nowrap px-5 py-4 font-mono text-[11px] text-[#64748B]">
                                        {formatUtc(hold.decided_at)}
                                    </td>

                                    <td className="whitespace-nowrap px-5 py-4 text-right">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setOpenId(hold.decision_id);
                                            }}
                                            className="rounded bg-[#0D9488] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase text-white transition hover:bg-[#0F766E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
                                        >
                                            Review
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {!loading && holds.length === 0 && !error && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-16 text-center text-sm text-[#64748B]"
                                    >
                                        No actions are waiting on a human decision.
                                    </td>
                                </tr>
                            )}

                            {loading && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-16 text-center text-sm text-[#64748B]"
                                    >
                                        Loading the hold queue…
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function HoldReview({
    decisionId,
    toast,
    onBack,
    onResolved,
}: {
    decisionId: string;
    toast: string | null;
    onBack: () => void;
    onResolved: (message: string) => void;
}) {
    const { actor } = useSession();
    const [context, setContext] = useState<DecisionContext | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState<"APPROVE" | "DENY" | null>(null);

    useEffect(() => {
        let cancelled = false;

        getDecisionContext(decisionId)
            .then((loaded) => {
                if (cancelled) return;
                setContext(loaded);
                setError(null);
            })
            .catch((caught) => {
                if (cancelled) return;
                setError(
                    caught instanceof ApiError ? caught.message : "Failed to load decision"
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [decisionId]);

    const submit = async (outcome: "APPROVE" | "DENY") => {
        setSubmitting(outcome);

        try {
            await resolveHold(decisionId, {
                outcome,
                resolved_by: actor.actor_id,
                note: note.trim(),
            });

            onResolved(
                outcome === "APPROVE"
                    ? `${decisionId} approved by ${actor.actor_id} — the release is authorized`
                    : `${decisionId} denied by ${actor.actor_id}`
            );
        } catch (caught) {
            setError(
                caught instanceof ApiError ? caught.message : "Failed to record the decision"
            );
            setSubmitting(null);
        }
    };

    const decision = context?.decision;
    const transaction = context?.transaction;
    const evidence = context?.evidence;
    // Only the role the engine handed this hold to may settle it. The backend
    // refuses anyone else; the console says so before a button is pressed.
    const canDecide = holdsAuthority(actor.role, decision?.required_authority);

    return (
        <div className="flex w-full flex-col gap-6">
            {toast && (
                <div
                    role="status"
                    className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded border border-[#0D9488]/40 bg-[#0F172A] px-4 py-2.5 font-mono text-[11px] text-white shadow-lg"
                >
                    {toast}
                </div>
            )}

            <button
                type="button"
                onClick={onBack}
                className="flex w-fit items-center gap-1.5 rounded font-mono text-[11px] uppercase tracking-[0.08em] text-[#64748B] transition hover:text-[#0D9488] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
            >
                <ChevronLeft size={15} />
                Hold Queue
            </button>

            {loading && (
                <p className="py-16 text-center text-sm text-[#64748B]">
                    Loading decision context…
                </p>
            )}

            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#DC2626]" />
                    <p className="font-mono text-[11px] text-[#B91C1C]">{error}</p>
                </div>
            )}

            {decision && (
                <>
                    <section className="flex flex-col justify-between gap-5 rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:flex-row xl:items-center">
                        <div>
                            <div className="mb-1 flex flex-wrap items-center gap-3">
                                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                                    Authority Transfer
                                </span>

                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FEF3C7] bg-[#FFFBEB] px-2 py-1 font-mono text-[10px] font-semibold uppercase text-[#B45309]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
                                    Hold
                                </span>

                                <span className="rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-[10px] text-[#0F172A]">
                                    {decision.required_authority}
                                </span>
                            </div>

                            <h1 className="text-3xl font-semibold tracking-[-0.02em] text-[#0F172A]">
                                {transaction?.action ?? "PROTECTED ACTION"}
                                {transaction ? ` · ${transaction.resource_id}` : ""}
                            </h1>

                            <p className="mt-1.5 font-mono text-[11px] text-[#64748B]">
                                {decision.decision_id} &nbsp;|&nbsp; {decision.transaction_id}{" "}
                                &nbsp;|&nbsp; held {formatUtc(decision.decided_at)}
                            </p>
                        </div>

                        {transaction && (
                            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                                    Declared Value
                                </p>
                                <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0F172A]">
                                    {money.format(Number(transaction.value))}
                                </p>
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#D97706] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                            Why the policy engine held this
                        </p>

                        <ul className="mt-3 flex flex-col gap-2">
                            {decision.reasons.map((reason) => (
                                <li
                                    key={reason}
                                    className="text-sm leading-relaxed text-[#0F172A]"
                                >
                                    {reason}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
                        <div className="rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:col-span-4">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                                Requested Action
                            </p>

                            <div className="mt-4 space-y-2 font-mono text-[11px] text-[#64748B]">
                                <Row label="Actor" value={transaction?.actor_id ?? "—"} />
                                <Row label="Action" value={transaction?.action ?? "—"} />
                                <Row label="Resource" value={transaction?.resource_id ?? "—"} />
                                <Row label="Zone" value={transaction?.zone ?? "—"} />
                                <Row
                                    label="Requested"
                                    value={transaction ? formatUtc(transaction.timestamp) : "—"}
                                />
                            </div>
                        </div>

                        <div className="rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:col-span-4">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                                Network Evidence
                            </p>

                            <div className="mt-4 flex flex-col gap-2">
                                <EvidenceRow
                                    label="Number verification"
                                    kind="NUMBER_VERIFICATION"
                                    plan={context?.evidence_plan}
                                    state={evidence?.number_verified ?? null}
                                />
                                <EvidenceRow
                                    label="Location verification"
                                    kind="LOCATION_VERIFICATION"
                                    plan={context?.evidence_plan}
                                    state={evidence?.location_verified ?? null}
                                />
                                <EvidenceRow
                                    label="SIM swap check"
                                    kind="SIM_SWAP"
                                    plan={context?.evidence_plan}
                                    state={evidence?.recent_sim_swap ?? null}
                                />
                                <EvidenceRow
                                    label="Device swap check"
                                    kind="DEVICE_SWAP"
                                    plan={context?.evidence_plan}
                                    state={evidence?.recent_device_swap ?? null}
                                />
                                <EvidenceRow
                                    label="Reachability"
                                    kind="REACHABILITY"
                                    plan={context?.evidence_plan}
                                    state={evidence?.reachable ?? null}
                                />
                            </div>

                            {context?.evidence_plan && (
                                <p className="mt-4 font-mono text-[10px] leading-relaxed text-[#64748B]">
                                    COLLECTED: {context.evidence_plan.combined.join(", ")}
                                </p>
                            )}
                        </div>

                        <div className="rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] xl:col-span-4">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                                Agent Assessment (advisory)
                            </p>

                            {decision.context_evaluation ? (
                                <>
                                    <div className="mt-4 flex flex-wrap gap-1.5">
                                        {decision.context_evaluation.risk_factors.map((factor) => (
                                            <span
                                                key={factor}
                                                className="rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-[10px] text-[#0F172A]"
                                            >
                                                {factor}
                                            </span>
                                        ))}
                                    </div>

                                    <p className="mt-4 text-sm italic leading-relaxed text-[#0F172A]">
                                        &ldquo;{decision.context_evaluation.rationale}&rdquo;
                                    </p>

                                    <p className="mt-3 font-mono text-[10px] text-[#64748B]">
                                        RECOMMENDED: {decision.context_evaluation.recommended_control}{" "}
                                        · advisory only, never binding
                                    </p>
                                </>
                            ) : (
                                <p className="mt-4 text-sm leading-relaxed text-[#64748B]">
                                    No agent assessment was recorded. The AI runtime was
                                    unavailable, so evidence planning fell back to the mandatory
                                    baseline and the decision was made on network facts alone.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                            Your decision as {decision.required_authority}
                        </p>

                        {!canDecide && (
                            <p
                                role="note"
                                className="mt-3 rounded border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-sm text-[#92400E]"
                            >
                                This hold can only be resolved by{" "}
                                <span className="font-mono">{decision.required_authority ?? "a named authority"}</span>.
                                You are signed in as <span className="font-mono">{actor.role}</span>.
                            </p>
                        )}

                        <label className="mt-4 flex flex-col gap-1.5">
                            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                                Justification (recorded in the audit trail)
                            </span>

                            <textarea
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                rows={3}
                                placeholder="What did you verify before deciding?"
                                disabled={!canDecide}
                                className="w-full rounded border border-[#CBD5E1] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/15"
                            />
                        </label>

                        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => void submit("DENY")}
                                disabled={submitting !== null || !canDecide}
                                className="flex items-center justify-center gap-2 rounded bg-[#B91C1C] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#991B1B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#991B1B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <XCircle size={16} />
                                {submitting === "DENY" ? "Recording…" : "Final Deny"}
                            </button>

                            <button
                                type="button"
                                onClick={() => void submit("APPROVE")}
                                disabled={submitting !== null || !canDecide}
                                className="flex items-center justify-center gap-2 rounded bg-[#0D9488] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#0F766E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <CheckCircle2 size={16} />
                                {submitting === "APPROVE" ? "Recording…" : "Final Approve"}
                            </button>
                        </div>

                        <p className="mt-4 font-mono text-[10px] leading-relaxed text-[#64748B]">
                            Your verdict and your note are recorded against the decision and
                            appear at the top of its record; the policy engine&rsquo;s own
                            outcome stays HOLD in the audit trail.
                        </p>
                    </section>
                </>
            )}
        </div>
    );
}

function QueueTile({
    label,
    value,
    meta,
    icon,
}: {
    label: string;
    value: string;
    meta: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                    {label}
                </span>
                <span className="text-[#64748B]">{icon}</span>
            </div>

            <p className="mt-3 text-2xl font-semibold tabular-nums text-[#0F172A]">
                {value}
            </p>

            <p className="mt-1 font-mono text-[10px] text-[#64748B]">{meta}</p>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 border-b border-[#E2E8F0] pb-1.5 last:border-b-0">
            <span>{label.toUpperCase()}</span>
            <span className="text-right font-medium text-[#0F172A]">{value}</span>
        </div>
    );
}
