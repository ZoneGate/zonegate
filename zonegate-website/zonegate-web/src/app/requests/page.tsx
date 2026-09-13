"use client";

/**
 * The authorization queue.
 *
 * Every column here comes from `/v1/authorizations/contexts`. The backend
 * records an authorization decision — actor, action, resource, zone, value,
 * the network evidence collected, and who decided — and nothing more. Physical
 * manifest detail (driver, plate, seal, tonnage, TWIC) is not data ZoneGate
 * holds, so it is absent rather than invented: a console for a security
 * product must not show fields that no system of record backs.
 *
 * Anything an operator does add lands in the transaction's `metadata`, which
 * is free-form and shown verbatim in the detail panel.
 */

import { useEffect, useMemo, useState } from "react";

import {
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Search,
} from "lucide-react";

import DecisionVerdict from "@/components/DecisionVerdict";
import ZoneMap from "@/components/ZoneMap";
import { useQueryParam } from "@/components/useQueryParam";
import {
    ApiError,
    listDecisionContexts,
    listZones,
    type DecisionContext,
    type DecisionOutcome,
    type GeofenceZone,
} from "@/lib/api";
import {
    badgeLabel,
    effectiveOutcome,
    isAwaitingAuthority,
    shortStamp,
    shortTime,
} from "@/lib/derive";
import EvidenceRow from "@/components/EvidenceRow";

const TABS = [
    "All Requests",
    "Awaiting Authority",
    "Approved",
    "Denied",
    "Human Decided",
] as const;

type Tab = (typeof TABS)[number];

const SORTS = {
    "Newest First": (a: DecisionContext, b: DecisionContext) =>
        b.decision.decided_at.localeCompare(a.decision.decided_at),
    "Oldest First": (a: DecisionContext, b: DecisionContext) =>
        a.decision.decided_at.localeCompare(b.decision.decided_at),
    "Highest Value": (a: DecisionContext, b: DecisionContext) =>
        Number(b.transaction?.value ?? 0) - Number(a.transaction?.value ?? 0),
    "Resource A-Z": (a: DecisionContext, b: DecisionContext) =>
        (a.transaction?.resource_id ?? "").localeCompare(
            b.transaction?.resource_id ?? ""
        ),
} as const;

type SortKey = keyof typeof SORTS;

const PAGE_SIZE = 8;

function matchesTab(context: DecisionContext, tab: Tab): boolean {
    const decision = context.decision;
    const outcome = effectiveOutcome(decision);

    switch (tab) {
        case "Awaiting Authority":
            return isAwaitingAuthority(decision);
        case "Approved":
            return outcome === "APPROVE";
        case "Denied":
            return outcome === "DENY";
        case "Human Decided":
            return decision.resolution !== null;
        default:
            return true;
    }
}

export default function RequestsPage() {
    const initialQuery = useQueryParam("q");

    // Remounting on a new query seeds the filter without a synchronising effect.
    return <RequestsView key={initialQuery} initialQuery={initialQuery} />;
}

function RequestsView({ initialQuery }: { initialQuery: string }) {
    const [contexts, setContexts] = useState<DecisionContext[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<Tab>("All Requests");
    const [search, setSearch] = useState(initialQuery);
    const [zone, setZone] = useState("All Zones");
    const [sort, setSort] = useState<SortKey>("Newest First");
    const [page, setPage] = useState(0);

    // null keeps the queue on screen; an id opens that record full width.
    const [openId, setOpenId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    // Drawn on the detail map. The registry is small and never changes at
    // runtime, so it is fetched once alongside the queue.
    const [geofences, setGeofences] = useState<GeofenceZone[]>([]);

    // Bumping this re-runs the fetch; state is only set from its callbacks.
    const [reloadToken, setReloadToken] = useState(0);
    const reload = () => setReloadToken((current) => current + 1);

    useEffect(() => {
        let cancelled = false;

        listDecisionContexts({ limit: 200 })
            .then((loaded) => {
                if (cancelled) return;
                setContexts(loaded);
                setError(null);
            })
            .catch((caught) => {
                if (cancelled) return;
                setError(
                    caught instanceof ApiError
                        ? caught.message
                        : "Unexpected error loading the authorization queue"
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
        let cancelled = false;

        // A console that cannot reach the zone registry still shows every
        // decision; only the map is missing, so this failure is swallowed.
        listZones()
            .then((loaded) => {
                if (!cancelled) setGeofences(loaded);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!toast) return;

        const id = window.setTimeout(() => setToast(null), 3200);
        return () => window.clearTimeout(id);
    }, [toast]);

    const zones = useMemo(() => {
        const found = new Set<string>();
        for (const context of contexts) {
            if (context.transaction?.zone) found.add(context.transaction.zone);
        }
        return ["All Zones", ...[...found].sort()];
    }, [contexts]);

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return contexts
            .filter((context) => matchesTab(context, activeTab))
            .filter((context) =>
                zone === "All Zones" ? true : context.transaction?.zone === zone
            )
            .filter((context) => {
                if (!needle) return true;

                const haystack = [
                    context.decision.decision_id,
                    context.decision.transaction_id,
                    context.transaction?.resource_id,
                    context.transaction?.actor_id,
                    context.transaction?.zone,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(needle);
            })
            .sort(SORTS[sort]);
    }, [contexts, activeTab, zone, search, sort]);

    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const clampedPage = Math.min(page, pageCount - 1);
    const rows = visible.slice(
        clampedPage * PAGE_SIZE,
        clampedPage * PAGE_SIZE + PAGE_SIZE
    );

    const countFor = (tab: Tab) =>
        contexts.filter((context) => matchesTab(context, tab)).length;

    const open = contexts.find(
        (context) => context.decision.decision_id === openId
    );

    if (open) {
        return (
            <RecordDetail
                context={open}
                zones={geofences}
                onBack={() => setOpenId(null)}
            />
        );
    }

    return (
        <div className="flex w-full flex-col gap-6">
            {toast && (
                <div
                    role="status"
                    className="rounded-lg border border-[#CCFBF1] bg-[#F0FDFA] px-4 py-3 text-sm text-[#0F766E]"
                >
                    {toast}
                </div>
            )}

            <section className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-4 lg:flex-row lg:items-end">
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-[#64748B]">
                        Authorization Queue // Berth-04
                    </p>

                    <h1 className="mt-1 text-2xl font-semibold uppercase tracking-tight text-[#0F172A]">
                        Authorization Requests
                    </h1>

                    <p className="mt-1 text-sm text-[#64748B]">
                        Every decision the policy engine has recorded, with the
                        evidence behind it.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={reload}
                        disabled={loading}
                        className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-[11px] text-[#0F172A] transition hover:border-[#0D9488] disabled:opacity-50"
                    >
                        <RefreshCw size={14} className="text-[#0D9488]" />
                        REFRESH
                    </button>

                </div>
            </section>

            {error && (
                <div
                    role="alert"
                    className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3"
                >
                    <p className="text-sm font-medium text-[#B91C1C]">
                        Authorization API unavailable
                    </p>

                    <p className="mt-1 font-mono text-[11px] text-[#DC2626]">
                        {error}
                    </p>
                </div>
            )}

            <section className="flex flex-wrap gap-2">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => {
                            setActiveTab(tab);
                            setPage(0);
                        }}
                        className={`rounded border px-3 py-1.5 text-xs transition ${
                            activeTab === tab
                                ? "border-[#0D9488] bg-[#0D9488]/5 text-[#0F766E]"
                                : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#CBD5E1]"
                        }`}
                    >
                        {tab}
                        <span className="ml-2 font-mono text-[10px] text-[#94A3B8]">
                            {countFor(tab)}
                        </span>
                    </button>
                ))}
            </section>

            <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                    />

                    <input
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(0);
                        }}
                        placeholder="Search decision, transaction, resource, actor…"
                        className="w-full rounded border border-[#E2E8F0] bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#0D9488]"
                    />
                </div>

                <select
                    value={zone}
                    onChange={(event) => {
                        setZone(event.target.value);
                        setPage(0);
                    }}
                    className="rounded border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-[11px] outline-none focus:border-[#0D9488]"
                >
                    {zones.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>

                <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    className="rounded border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-[11px] outline-none focus:border-[#0D9488]"
                >
                    {Object.keys(SORTS).map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            </section>

            <section className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead className="bg-[#F8FAFC]">
                            <tr className="border-b border-[#E2E8F0]">
                                {[
                                    "Decision ID",
                                    "Resource",
                                    "Requested By",
                                    "Zone",
                                    "Value",
                                    "Decided",
                                    "Outcome",
                                ].map((head) => (
                                    <th
                                        key={head}
                                        className="px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-[#64748B]"
                                    >
                                        {head}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {rows.map((context) => {
                                const decision = context.decision;
                                const outcome = effectiveOutcome(decision);

                                return (
                                    <tr
                                        key={decision.decision_id}
                                        onClick={() =>
                                            setOpenId(decision.decision_id)
                                        }
                                        className="cursor-pointer border-b border-[#F1F5F9] last:border-b-0 hover:bg-[#F8FAFC]"
                                    >
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {decision.decision_id}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-xs">
                                            {context.transaction?.resource_id ??
                                                "—"}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                            {context.transaction?.actor_id ??
                                                "—"}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                            {context.transaction?.zone ?? "—"}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                            {context.transaction
                                                ? `$${context.transaction.value}`
                                                : "—"}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                            {shortTime(decision.decided_at)}
                                        </td>

                                        <td className="px-4 py-3">
                                            <OutcomeBadge
                                                outcome={outcome}
                                                awaiting={isAwaitingAuthority(
                                                    decision
                                                )}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}

                            {!rows.length && (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-4 py-16 text-center text-sm text-[#64748B]"
                                    >
                                        {loading
                                            ? "Loading the authorization queue…"
                                            : contexts.length
                                              ? "No requests match these filters."
                                              : "No authorization requests on record yet."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {visible.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between border-t border-[#F1F5F9] px-4 py-3">
                        <p className="font-mono text-[11px] text-[#64748B]">
                            {clampedPage * PAGE_SIZE + 1}–
                            {Math.min(
                                (clampedPage + 1) * PAGE_SIZE,
                                visible.length
                            )}{" "}
                            of {visible.length}
                        </p>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setPage(Math.max(0, clampedPage - 1))}
                                disabled={clampedPage === 0}
                                className="rounded border border-[#E2E8F0] p-1.5 transition hover:border-[#0D9488] disabled:opacity-40"
                                aria-label="Previous page"
                            >
                                <ChevronLeft size={14} />
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    setPage(Math.min(pageCount - 1, clampedPage + 1))
                                }
                                disabled={clampedPage >= pageCount - 1}
                                className="rounded border border-[#E2E8F0] p-1.5 transition hover:border-[#0D9488] disabled:opacity-40"
                                aria-label="Next page"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </section>

        </div>
    );
}

function OutcomeBadge({
    outcome,
    awaiting,
}: {
    outcome: DecisionOutcome;
    awaiting: boolean;
}) {
    const label = awaiting ? "AWAITING AUTHORITY" : badgeLabel(outcome);

    const style = awaiting
        ? "border-[#FEF3C7] bg-[#FFFBEB] text-[#B45309]"
        : outcome === "APPROVE"
          ? "border-[#CCFBF1] bg-[#F0FDFA] text-[#0F766E]"
          : outcome === "HOLD"
            ? "border-[#FEF3C7] bg-[#FFFBEB] text-[#B45309]"
            : "border-[#FEE2E2] bg-[#FEF2F2] text-[#B91C1C]";

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] ${style}`}
        >
            {label}
        </span>
    );
}

function RecordDetail({
    context,
    zones,
    onBack,
}: {
    context: DecisionContext;
    zones: GeofenceZone[];
    onBack: () => void;
}) {
    const decision = context.decision;
    const transaction = context.transaction;
    const evidence = context.evidence;
    const resolution = decision.resolution;
    const outcome = effectiveOutcome(decision);
    const geofence = zones.find((entry) => entry.zone === transaction?.zone);
    // Identity and unsupported-action refusals are recorded before planning
    // starts, so they carry neither a plan nor evidence. Any decision that got
    // as far as planning has at least one of the two.
    const reachedPlanning = Boolean(context.evidence_plan || evidence);

    return (
        <div className="flex w-full flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-4 lg:flex-row lg:items-end">
                <div>
                    <button
                        type="button"
                        onClick={onBack}
                        className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-[#0D9488] transition hover:text-[#0F766E]"
                    >
                        <ChevronLeft size={14} />
                        BACK TO QUEUE
                    </button>

                    <h1 className="text-2xl font-semibold uppercase tracking-tight text-[#0F172A]">
                        {transaction
                            ? `${transaction.action} · ${transaction.resource_id}`
                            : decision.decision_id}
                    </h1>

                    <p className="mt-1 font-mono text-[11px] text-[#64748B]">
                        {decision.decision_id} · {decision.transaction_id}
                    </p>
                </div>

                <OutcomeBadge
                    outcome={outcome}
                    awaiting={isAwaitingAuthority(decision)}
                />
            </section>

            <DecisionVerdict decision={decision} />

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {/* The map leads: it is the one panel that shows where the device
                    was checked, and it was lost below the fold. */}
                {/* A request refused before any evidence was gathered never
                    had its location checked; drawing a zone would imply it was. */}
                {evidence && (
                <Panel title="Geofence Checked">
                    {geofence ? (
                        <ZoneMap
                            latitude={geofence.latitude}
                            longitude={geofence.longitude}
                            radiusMeters={geofence.radius_meters}
                            label={geofence.zone}
                            verified={evidence?.location_verified ?? null}
                        />
                    ) : (
                        <p className="text-sm leading-relaxed text-[#64748B]">
                            {transaction
                                ? `Zone '${transaction.zone}' is not in the gateway's registry, so the location check fell back to the default geofence. There is no circle to draw for it.`
                                : "The transaction behind this decision is no longer on record."}
                        </p>
                    )}
                </Panel>
                )}
                <Panel title="Network Evidence">
                    {evidence ? (
                        <>
                            <EvidenceRow
                                label="Number verification"
                                kind="NUMBER_VERIFICATION"
                                plan={context.evidence_plan}
                                state={evidence.number_verified}
                            />
                            <EvidenceRow
                                label="Location verification"
                                kind="LOCATION_VERIFICATION"
                                plan={context.evidence_plan}
                                state={evidence.location_verified}
                            />
                            <EvidenceRow
                                label="SIM swap check"
                                kind="SIM_SWAP"
                                plan={context.evidence_plan}
                                state={evidence.recent_sim_swap}
                            />
                            <EvidenceRow
                                label="Device swap check"
                                kind="DEVICE_SWAP"
                                plan={context.evidence_plan}
                                state={evidence.recent_device_swap}
                            />
                            <EvidenceRow
                                label="Reachability"
                                kind="REACHABILITY"
                                plan={context.evidence_plan}
                                state={evidence.reachable}
                            />

                            {context.evidence_plan && (
                                <p className="mt-3 font-mono text-[10px] leading-relaxed text-[#94A3B8]">
                                    Collected:{" "}
                                    {context.evidence_plan.combined.join(", ") ||
                                        "none"}
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-[#64748B]">
                            No evidence was recorded for this decision.
                        </p>
                    )}
                </Panel>

                <Panel title="Policy Outcome">
                    {decision.reasons.map((reason) => (
                        <p
                            key={reason}
                            className="mb-2 text-sm leading-relaxed text-[#0F172A]"
                        >
                            {reason}
                        </p>
                    ))}

                    <Field
                        label="Decision source"
                        value={
                            resolution
                                ? "AUTHORIZED HUMAN"
                                : "DETERMINISTIC POLICY"
                        }
                    />

                    {decision.required_authority && (
                        <Field
                            label="Required authority"
                            value={decision.required_authority}
                        />
                    )}

                    <Field
                        label="Decided at"
                        value={shortStamp(decision.decided_at)}
                    />
                </Panel>

                <Panel title="Requested Action">
                    {transaction ? (
                        <>
                            <Field label="Actor" value={transaction.actor_id} />
                            <Field label="Action" value={transaction.action} />
                            <Field
                                label="Resource"
                                value={transaction.resource_id}
                            />
                            <Field label="Zone" value={transaction.zone} />
                            <Field
                                label="Category"
                                value={transaction.category ?? "GENERAL"}
                            />
                            <Field
                                label="Declared value"
                                value={`$${transaction.value}`}
                            />
                            <Field
                                label="Requested"
                                value={shortStamp(transaction.timestamp)}
                            />

                            {Object.entries(transaction.metadata ?? {}).map(
                                ([key, value]) => (
                                    <Field key={key} label={key} value={value} />
                                )
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-[#64748B]">
                            The transaction behind this decision is no longer on
                            record.
                        </p>
                    )}
                </Panel>

                <Panel title="Evidence Plan" wide>
                    {context.evidence_plan ? (
                        <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <PlanColumn
                                    label="Required by policy"
                                    caption="Enforced for every request. The agent is never asked."
                                    kinds={context.evidence_plan.mandatory}
                                    tone="enforced"
                                />

                                <PlanColumn
                                    label="Offered to the agent"
                                    caption="The only kinds it is permitted to choose from."
                                    kinds={context.evidence_plan.offered_optional}
                                    tone="offered"
                                />

                                <PlanColumn
                                    label="Agent asked for"
                                    caption={
                                        context.evidence_plan.planner_consulted
                                            ? "Its selection, before validation."
                                            : "No plan was returned."
                                    }
                                    kinds={context.evidence_plan.proposed_optional}
                                    tone="proposed"
                                    empty={
                                        context.evidence_plan.planner_consulted
                                            ? "nothing extra"
                                            : "planner not consulted"
                                    }
                                />
                            </div>

                            <div className="mt-4 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
                                <p className="font-mono text-[10px] leading-relaxed text-[#0F172A]">
                                    VALIDATOR &rarr;{" "}
                                    {context.evidence_plan.mandatory.length} mandatory
                                    enforced, {context.evidence_plan.optional.length}{" "}
                                    optional accepted, 0 rejected
                                </p>

                                <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#64748B]">
                                    COLLECTED &rarr;{" "}
                                    {context.evidence_plan.combined.join(", ") || "none"}
                                </p>
                            </div>

                            {context.evidence_plan.rationale.length > 0 && (
                                <p className="mt-3 text-xs italic leading-relaxed text-[#64748B]">
                                    &ldquo;{context.evidence_plan.rationale[0]}&rdquo;
                                </p>
                            )}

                            <p className="mt-3 text-[11px] leading-relaxed text-[#94A3B8]">
                                A plan that proposes a forbidden kind is refused
                                outright and the request is denied; it is never
                                silently dropped.
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-[#64748B]">
                            {reachedPlanning
                                ? "This decision predates evidence-plan tracing, so how the plan was reached was not recorded."
                                : "The request was refused before evidence planning, so no plan was drawn up and the carrier was never asked."}
                        </p>
                    )}
                </Panel>

                <Panel title="Agent Assessment (Advisory)">
                    {decision.context_evaluation ? (
                        <>
                            <div className="mb-3 flex flex-wrap gap-1.5">
                                {decision.context_evaluation.risk_factors.map(
                                    (factor) => (
                                        <span
                                            key={factor}
                                            className="rounded bg-[#F1F5F9] px-2 py-1 font-mono text-[10px] text-[#0F172A]"
                                        >
                                            {factor}
                                        </span>
                                    )
                                )}
                            </div>

                            <p className="text-sm italic leading-relaxed text-[#0F172A]">
                                {decision.context_evaluation.rationale}
                            </p>

                            <p className="mt-3 font-mono text-[10px] text-[#94A3B8]">
                                Recommended:{" "}
                                {
                                    decision.context_evaluation
                                        .recommended_control
                                }{" "}
                                — advisory only, never binding
                            </p>
                        </>
                    ) : (
                        <p className="text-sm leading-relaxed text-[#64748B]">
                            {reachedPlanning
                                ? "No agent assessment was recorded. Evidence planning fell back to the mandatory baseline and the decision was made on network facts alone."
                                : "The agent was never consulted: the request was refused before evidence planning, on the record of who asked rather than on network facts."}
                        </p>
                    )}
                </Panel>

                {resolution && (
                    <Panel title="Human Resolution">
                        {/* The verdict and the note are already at the top of
                            the record; this is the structured version of the
                            same facts, for anyone reading the audit trail. */}
                        <Field label="Final outcome" value={resolution.outcome} />
                        <Field label="Decided by" value={resolution.resolved_by} />
                        <Field label="Authority" value={resolution.authority_role} />
                        <Field
                            label="Decided at"
                            value={shortStamp(resolution.resolved_at)}
                        />
                        <Field
                            label="Engine outcome"
                            value={`${decision.decision} (never rewritten)`}
                        />
                    </Panel>
                )}

            </section>
        </div>
    );
}

function PlanColumn({
    label,
    caption,
    kinds,
    tone,
    empty = "none",
}: {
    label: string;
    caption: string;
    kinds: string[];
    tone: "enforced" | "offered" | "proposed";
    empty?: string;
}) {
    const chip =
        tone === "enforced"
            ? "border-[#0D9488] bg-[#F0FDFA] text-[#0F766E]"
            : tone === "proposed"
              ? "border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]"
              : "border-[#E2E8F0] bg-white text-[#64748B]";

    return (
        <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                {label}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
                {kinds.length > 0 ? (
                    kinds.map((kind) => (
                        <span
                            key={kind}
                            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${chip}`}
                        >
                            {kind}
                        </span>
                    ))
                ) : (
                    <span className="font-mono text-[10px] text-[#94A3B8]">
                        {empty}
                    </span>
                )}
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-[#94A3B8]">
                {caption}
            </p>
        </div>
    );
}

function Panel({
    title,
    children,
    wide,
}: {
    title: string;
    children: React.ReactNode;
    wide?: boolean;
}) {
    return (
        <div
            className={`rounded-lg border border-[#E2E8F0] bg-white${
                wide ? " xl:col-span-2" : ""
            }`}
        >
            <div className="border-b border-[#F1F5F9] px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                    {title}
                </p>
            </div>

            <div className="p-4">{children}</div>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-xs text-[#64748B]">{label}</span>

            <span className="text-right font-mono text-[11px] font-medium text-[#0F172A]">
                {value}
            </span>
        </div>
    );
}
