"use client";

/**
 * The enrolled roster.
 *
 * Identity comes from `/v1/actors`, which returns each enrolled actor with the
 * device binding the Evidence Gateway checks against. The per-actor history is
 * that actor's own decisions from the authorization log — a real audit trail,
 * not a synthesised access feed.
 *
 * Badge photos, biometric scores, clearance tiers and checkpoint scans are not
 * data ZoneGate holds. They are absent rather than invented: an operator
 * reading a security console has to be able to trust every field on it.
 */

import { useEffect, useMemo, useState } from "react";
import PermissionEditor from "@/components/PermissionEditor";
import EnrollmentForm from "@/components/EnrollmentForm";

import {
    ChevronLeft,
    RefreshCw,
    Search,
    UserPlus,
    ShieldAlert,
    ShieldCheck,
    Smartphone,
    UserRound,
} from "lucide-react";

import {
    ApiError,
    listActors,
    listDecisionContexts,
    type DecisionContext,
    type RosterEntry,
} from "@/lib/api";
import {
    badgeLabel,
    countByOutcome,
    effectiveOutcome,
    isAwaitingAuthority,
    shortStamp,
} from "@/lib/derive";

/** `+14155550199` -> `+1415•••0199`, so a full number is not readable in passing. */
function maskNumber(value: string): string {
    if (value.length < 9) return value;
    return `${value.slice(0, 5)}•••${value.slice(-4)}`;
}

/** `dev_imei_99887766` -> `99887766`. */
function deviceReference(deviceId: string): string {
    const parts = deviceId.split("_");
    return parts.length ? parts[parts.length - 1] : deviceId;
}

function initialsFor(actorId: string): string {
    const parts = actorId.split("_").filter((part) => part && part !== "usr");
    if (!parts.length) return actorId.slice(0, 2).toUpperCase();
    return parts
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
}

type Enriched = RosterEntry & {
    decisions: DecisionContext[];
    /** True when this actor can actually pass authorization today. */
    operational: boolean;
};

export default function EmployeesPage() {
    const [roster, setRoster] = useState<RosterEntry[]>([]);
    const [contexts, setContexts] = useState<DecisionContext[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [role, setRole] = useState("ALL");
    const [status, setStatus] = useState("ALL");
    const [openId, setOpenId] = useState<string | null>(null);
    const [permissionId, setPermissionId] = useState<string | null>(null);
    const [enrolling, setEnrolling] = useState(false);

    const [reloadToken, setReloadToken] = useState(0);
    const reload = () => setReloadToken((current) => current + 1);

    useEffect(() => {
        let cancelled = false;

        Promise.all([listActors(), listDecisionContexts({ limit: 500 })])
            .then(([loadedRoster, loadedContexts]) => {
                if (cancelled) return;

                setRoster(loadedRoster);
                setContexts(loadedContexts);
                setError(null);
            })
            .catch((caught) => {
                if (cancelled) return;

                setError(
                    caught instanceof ApiError
                        ? caught.message
                        : "Unexpected error loading the enrolled roster"
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    const enriched = useMemo<Enriched[]>(
        () =>
            roster.map((entry) => ({
                ...entry,
                decisions: contexts.filter(
                    (context) =>
                        context.transaction?.actor_id === entry.actor.actor_id
                ),
                operational:
                    entry.actor.enrollment_status.toUpperCase() === "ACTIVE" &&
                    Boolean(entry.binding?.is_active),
            })),
        [roster, contexts]
    );

    const roles = useMemo(
        () => ["ALL", ...new Set(enriched.map((entry) => entry.actor.role))],
        [enriched]
    );

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return enriched.filter((entry) => {
            if (role !== "ALL" && entry.actor.role !== role) return false;

            if (status === "OPERATIONAL" && !entry.operational) return false;
            if (status === "BLOCKED" && entry.operational) return false;

            if (!needle) return true;

            return [
                entry.actor.actor_id,
                entry.actor.role,
                entry.actor.permissions.join(" "),
            ]
                .join(" ")
                .toLowerCase()
                .includes(needle);
        });
    }, [enriched, search, role, status]);

    const open = enriched.find((entry) => entry.actor.actor_id === openId);
    const permissionEntry = roster.find((entry) => entry.actor.actor_id === permissionId);

    if (enrolling) {
        return <EnrollmentForm
            knownRoles={[...new Set(roster.map((entry) => entry.actor.role))].sort()}
            availablePermissions={[...new Set(roster.flatMap((entry) => entry.actor.permissions))].sort()}
            existingActorIds={roster.map((entry) => entry.actor.actor_id)}
            onBack={() => setEnrolling(false)}
            onEnrolled={({ actor, binding }) => {
                // The roster reads newest first, so the new identity leads it.
                setRoster((current) => [{ actor, binding }, ...current.filter((entry) => entry.actor.actor_id !== actor.actor_id)]);
                setEnrolling(false);
                setOpenId(actor.actor_id);
            }}
        />;
    }

    if (permissionEntry) {
        return <PermissionEditor
            key={permissionEntry.actor.actor_id}
            actor={permissionEntry.actor}
            availablePermissions={[...new Set(roster.flatMap((entry) => entry.actor.permissions))].sort()}
            onBack={() => setPermissionId(null)}
            onSaved={(actor) => setRoster((current) => current.map((entry) => entry.actor.actor_id === actor.actor_id ? { ...entry, actor } : entry))}
        />;
    }

    if (open) {
        return <Dossier entry={open} onBack={() => setOpenId(null)} onEditPermissions={() => setPermissionId(open.actor.actor_id)} />;
    }

    const operationalCount = enriched.filter((entry) => entry.operational).length;

    return (
        <div className="flex w-full flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-4 lg:flex-row lg:items-end">
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-[#64748B]">
                        Enrolled Identities // Berth-04
                    </p>

                    <h1 className="mt-1 text-2xl font-semibold uppercase tracking-tight text-[#0F172A]">
                        Personnel &amp; Device Bindings
                    </h1>

                    <p className="mt-1 text-sm text-[#64748B]">
                        Every authorization is checked against an enrolled actor
                        and an active device binding.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start">
                    <button
                        type="button"
                        onClick={reload}
                        disabled={loading}
                        className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-[11px] text-[#0F172A] transition hover:border-[#0D9488] disabled:opacity-50"
                    >
                        <RefreshCw size={14} className="text-[#0D9488]" />
                        REFRESH ROSTER
                    </button>

                    <button
                        type="button"
                        onClick={() => setEnrolling(true)}
                        className="flex items-center gap-2 rounded bg-[#0F766E] px-3 py-2 font-mono text-[11px] text-white transition hover:bg-[#115E59]"
                    >
                        <UserPlus size={14} />
                        ENROLL EMPLOYEE
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

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SummaryTile
                    icon={<UserRound size={18} />}
                    label="Enrolled Actors"
                    value={loading && !roster.length ? "—" : String(enriched.length)}
                />

                <SummaryTile
                    icon={<ShieldCheck size={18} />}
                    label="Can Pass Authorization"
                    value={
                        loading && !roster.length ? "—" : String(operationalCount)
                    }
                />

                <SummaryTile
                    icon={<ShieldAlert size={18} />}
                    label="Blocked by Enrollment"
                    value={
                        loading && !roster.length
                            ? "—"
                            : String(enriched.length - operationalCount)
                    }
                    tone={enriched.length - operationalCount > 0 ? "warn" : "ok"}
                />
            </section>

            <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                    />

                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search actor, role, permission…"
                        className="w-full rounded border border-[#E2E8F0] bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#0D9488]"
                    />
                </div>

                <select
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    aria-label="Filter by role"
                    className="rounded border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-[11px] outline-none focus:border-[#0D9488]"
                >
                    {roles.map((option) => (
                        <option key={option} value={option}>
                            {option === "ALL" ? "All Roles" : option}
                        </option>
                    ))}
                </select>

                <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    aria-label="Filter by enrollment state"
                    className="rounded border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-[11px] outline-none focus:border-[#0D9488]"
                >
                    <option value="ALL">All States</option>
                    <option value="OPERATIONAL">Can Pass</option>
                    <option value="BLOCKED">Blocked</option>
                </select>
            </section>

            <section className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead className="bg-[#F8FAFC]">
                            <tr className="border-b border-[#E2E8F0]">
                                {[
                                    "Actor",
                                    "Role",
                                    "Permissions",
                                    "Bound Device",
                                    "Decisions",
                                    "State",
                                    "Actions",
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
                            {visible.map((entry) => (
                                <tr
                                    key={entry.actor.actor_id}
                                    onClick={() => setOpenId(entry.actor.actor_id)}
                                    className="cursor-pointer border-b border-[#F1F5F9] last:border-b-0 hover:bg-[#F8FAFC]"
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9] font-mono text-[10px] text-[#0F172A]">
                                                {initialsFor(entry.actor.actor_id)}
                                            </span>

                                            <span className="font-mono text-xs">
                                                {entry.actor.actor_id}
                                            </span>
                                        </div>
                                    </td>

                                    <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                        {entry.actor.role}
                                    </td>

                                    <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                        {entry.actor.permissions.length
                                            ? entry.actor.permissions.join(", ")
                                            : "none"}
                                    </td>

                                    <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                        {entry.binding
                                            ? deviceReference(entry.binding.device_id)
                                            : "unbound"}
                                    </td>

                                    <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                        {entry.decisions.length}
                                    </td>

                                    <td className="px-4 py-3">
                                        <StateBadge entry={entry} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            type="button"
                                            aria-label={`Edit permissions for ${entry.actor.actor_id}`}
                                            onClick={(event) => { event.stopPropagation(); setPermissionId(entry.actor.actor_id); }}
                                            className="whitespace-nowrap rounded-md border border-[#99F6E4] px-3 py-2 text-sm font-medium text-[#0F766E] hover:bg-[#F0FDFA] focus-visible:outline-2 focus-visible:outline-[#0D9488]"
                                        >Edit permissions</button>
                                    </td>
                                </tr>
                            ))}

                            {!visible.length && (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-4 py-16 text-center text-sm text-[#64748B]"
                                    >
                                        {loading ? (
                                            "Loading the enrolled roster…"
                                        ) : roster.length ? (
                                            "No actors match these filters."
                                        ) : (
                                            <>
                                                No actors are enrolled yet.{" "}
                                                <button
                                                    type="button"
                                                    onClick={() => setEnrolling(true)}
                                                    className="font-medium text-[#0F766E] underline underline-offset-2"
                                                >
                                                    Enroll the first employee
                                                </button>
                                                .
                                            </>
                                        )}
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

function StateBadge({ entry }: { entry: Enriched }) {
    if (entry.operational) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CCFBF1] bg-[#F0FDFA] px-2 py-1 font-mono text-[10px] text-[#0F766E]">
                CAN PASS
            </span>
        );
    }

    const reason = !entry.binding
        ? "NO BINDING"
        : !entry.binding.is_active
          ? "BINDING INACTIVE"
          : entry.actor.enrollment_status.toUpperCase();

    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FEE2E2] bg-[#FEF2F2] px-2 py-1 font-mono text-[10px] text-[#B91C1C]">
            {reason}
        </span>
    );
}

function SummaryTile({
    icon,
    label,
    value,
    tone = "ok",
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    tone?: "ok" | "warn";
}) {
    return (
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                    {label}
                </p>

                <span
                    className={tone === "warn" ? "text-[#B45309]" : "text-[#0D9488]"}
                >
                    {icon}
                </span>
            </div>

            <p className="font-mono text-2xl font-semibold text-[#0F172A]">
                {value}
            </p>
        </div>
    );
}

function Dossier({
    entry,
    onBack,
    onEditPermissions,
}: {
    entry: Enriched;
    onBack: () => void;
    onEditPermissions: () => void;
}) {
    const counts = countByOutcome(entry.decisions);

    return (
        <div className="flex w-full flex-col gap-6">
            <section className="border-b border-[#E2E8F0] pb-4">
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-2 flex items-center gap-1.5 font-mono text-[11px] text-[#0D9488] transition hover:text-[#0F766E]"
                >
                    <ChevronLeft size={14} />
                    BACK TO ROSTER
                </button>

                <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1F5F9] font-mono text-xs text-[#0F172A]">
                        {initialsFor(entry.actor.actor_id)}
                    </span>

                    <div>
                        <h1 className="text-2xl font-semibold uppercase tracking-tight text-[#0F172A]">
                            {entry.actor.actor_id}
                        </h1>

                        <p className="font-mono text-[11px] text-[#64748B]">
                            {entry.actor.role}
                        </p>
                    </div>

                    <div className="ml-auto">
                        <StateBadge entry={entry} />
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Panel title="Actor Identity" icon={<UserRound size={15} />}>
                    <InfoRow label="Actor ID" value={entry.actor.actor_id} />
                    <InfoRow label="Role" value={entry.actor.role} />
                    <InfoRow
                        label="Enrollment status"
                        value={entry.actor.enrollment_status}
                    />
                    <InfoRow
                        label="Permissions"
                        value={
                            entry.actor.permissions.length
                                ? entry.actor.permissions.join(", ")
                                : "none"
                        }
                    />
                    <button type="button" onClick={onEditPermissions} className="mt-4 rounded-md bg-[#0F766E] px-4 py-2 text-sm font-medium text-white hover:bg-[#115E59] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D9488]">Edit permissions</button>
                </Panel>

                <Panel title="Bound Device" icon={<Smartphone size={15} />}>
                    {entry.binding ? (
                        <>
                            <InfoRow
                                label="Registered number"
                                value={maskNumber(
                                    entry.actor.registered_phone_number
                                )}
                            />
                            <InfoRow
                                label="Device reference"
                                value={deviceReference(entry.binding.device_id)}
                            />
                            <InfoRow
                                label="Binding active"
                                value={entry.binding.is_active ? "YES" : "NO"}
                            />
                            <InfoRow
                                label="Bound at"
                                value={shortStamp(entry.binding.bound_at)}
                            />

                            <p className="mt-3 text-xs leading-relaxed text-[#94A3B8]">
                                A carrier call is only made for the number and
                                device bound here. If the binding fails, the
                                Gateway blocks the request before it reaches the
                                network.
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-[#B91C1C]">
                            No device is bound to this actor, so every
                            authorization they attempt is denied.
                        </p>
                    )}
                </Panel>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SummaryTile
                    icon={<ShieldCheck size={18} />}
                    label="Approved"
                    value={String(counts.APPROVE)}
                />
                <SummaryTile
                    icon={<ShieldAlert size={18} />}
                    label="Held"
                    value={String(counts.HOLD)}
                    tone={counts.HOLD > 0 ? "warn" : "ok"}
                />
                <SummaryTile
                    icon={<ShieldAlert size={18} />}
                    label="Denied"
                    value={String(counts.DENY)}
                    tone={counts.DENY > 0 ? "warn" : "ok"}
                />
            </section>

            <section className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
                <div className="border-b border-[#F1F5F9] px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                        Authorization History
                    </p>

                    <p className="mt-0.5 text-xs text-[#94A3B8]">
                        Every decision recorded against this actor
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead className="bg-[#F8FAFC]">
                            <tr className="border-b border-[#E2E8F0]">
                                {[
                                    "Decided",
                                    "Resource",
                                    "Zone",
                                    "Reason",
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
                            {entry.decisions.map((context) => {
                                const decision = context.decision;
                                const outcome = effectiveOutcome(decision);
                                const awaiting = isAwaitingAuthority(decision);

                                return (
                                    <tr
                                        key={decision.decision_id}
                                        className="border-b border-[#F1F5F9] last:border-b-0"
                                    >
                                        <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                            {shortStamp(decision.decided_at)}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-xs">
                                            {context.transaction?.resource_id ??
                                                "—"}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                            {context.transaction?.zone ?? "—"}
                                        </td>

                                        <td className="max-w-md px-4 py-3 text-xs text-[#64748B]">
                                            {decision.reasons[0] ?? "—"}
                                        </td>

                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex rounded-full border px-2 py-1 font-mono text-[10px] ${
                                                    awaiting
                                                        ? "border-[#FEF3C7] bg-[#FFFBEB] text-[#B45309]"
                                                        : outcome === "APPROVE"
                                                          ? "border-[#CCFBF1] bg-[#F0FDFA] text-[#0F766E]"
                                                          : outcome === "HOLD"
                                                            ? "border-[#FEF3C7] bg-[#FFFBEB] text-[#B45309]"
                                                            : "border-[#FEE2E2] bg-[#FEF2F2] text-[#B91C1C]"
                                                }`}
                                            >
                                                {awaiting
                                                    ? "AWAITING AUTHORITY"
                                                    : badgeLabel(outcome)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!entry.decisions.length && (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-12 text-center text-sm text-[#64748B]"
                                    >
                                        This actor has not attempted an
                                        authorization yet.
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

function Panel({
    title,
    icon,
    children,
}: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-[#E2E8F0] bg-white">
            <div className="flex items-center gap-2 border-b border-[#F1F5F9] px-4 py-3">
                <span className="text-[#0D9488]">{icon}</span>

                <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                    {title}
                </p>
            </div>

            <div className="p-4">{children}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-xs text-[#64748B]">{label}</span>

            <span className="text-right font-mono text-[11px] font-medium text-[#0F172A]">
                {value}
            </span>
        </div>
    );
}
