"use client";

import {
    Bell,
    CheckSquare,
    ChevronLeft,
    Download,
    Gavel,
    Lock,
    MapPin,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Settings2,
    ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useHash } from "@/components/useQueryParam";

import { useStoredValue } from "@/components/useStoredValue";
import {
    ApiError,
    getPolicyConfig,
    listCategories,
    listDecisionContexts,
    updatePolicyConfig,
    type CategoryOption,
    type PolicyConfig,
} from "@/lib/api";

type Zone = {
    name: string;
    code: string;
    type: string;
    staff: string;
    enabled: boolean;
};

const policies = [
    {
        id: "01",
        rule: "Location verification failed (Out of boundary coordinate)",
        decision: "DENY",
    },
    {
        id: "02",
        rule: "Number verification failed or permission mismatch",
        decision: "DENY",
    },
    {
        id: "03",
        rule: "Recent SIM swap detected on the bound subscriber line",
        decision: "HOLD",
    },
    {
        id: "04",
        rule: "Restricted cargo category, escalated to its named authority",
        decision: "HOLD",
    },
    {
        id: "05",
        rule: "All mandatory evidence verified successfully",
        decision: "APPROVE",
    },
];

const DEFAULT_CONFIG = {
    organization: "ZoneGate Logistics Global Berth",
    timezone: "UTC +03:00 (Kuwait, Riyadh, Nairobi)",
    locale: "English (US) - UTF-8 Compliant",
    dateFormat: "DD/MM/YYYY \u00b7 24-hour (ISO 8601 Tabular)",
    defaultView: "all",
    notifications: {
        denied: true,
        hold: true,
        nodeOffline: true,
        policyChanges: false,
    },
};

type Config = typeof DEFAULT_CONFIG;

const STORAGE_KEY = "zonegate.settings";

function parseConfig(raw: string | null): Config {
    if (!raw) return DEFAULT_CONFIG;

    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as Config;
    } catch {
        // A malformed store just leaves the defaults in place.
        return DEFAULT_CONFIG;
    }
}

export default function SettingsPage() {
    // The last committed configuration for this browser seeds the editor.
    // Keying on it swaps in the restored values without an effect.
    const stored = useStoredValue(STORAGE_KEY);

    return <SettingsEditor key={stored ?? "defaults"} initial={parseConfig(stored)} />;
}

/**
 * The policy the deterministic engine evaluates against.
 *
 * These are the only settings on this page that change how the backend
 * behaves; everything else is a display preference for this browser. Saving
 * here applies immediately to transactions evaluated from that point on —
 * decisions already recorded keep the reasons they were given.
 */
function PolicyThresholds() {
    const [config, setConfig] = useState<PolicyConfig | null>(null);
    const [draft, setDraft] = useState<PolicyConfig | null>(null);
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        getPolicyConfig()
            .then((loaded) => {
                if (cancelled) return;
                setConfig(loaded);
                setDraft(loaded);
                setError(null);
            })
            .catch((caught) => {
                if (cancelled) return;
                setError(
                    caught instanceof ApiError
                        ? caught.message
                        : "Unexpected error loading the policy configuration"
                );
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        // Only the vocabulary; which of these escalate comes from the config
        // being edited, so the two never disagree on screen.
        listCategories()
            .then((loaded) => {
                if (!cancelled) setCategories(loaded);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    const dirty =
        config !== null &&
        draft !== null &&
        JSON.stringify(config) !== JSON.stringify(draft);

    const save = async () => {
        if (!draft) return;

        setBusy(true);
        setError(null);
        setNote(null);

        try {
            const applied = await updatePolicyConfig(draft);
            setConfig(applied);
            setDraft(applied);
            setNote("Applied to the running policy engine.");
        } catch (caught) {
            setError(
                caught instanceof ApiError
                    ? caught.message
                    : "Unexpected error saving the policy configuration"
            );
        } finally {
            setBusy(false);
        }
    };

    if (error && !draft) {
        return (
            <p className="rounded border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 font-mono text-[11px] text-[#B91C1C]">
                {error}
            </p>
        );
    }

    if (!draft) {
        return (
            <p className="text-xs text-[#94A3B8]">
                Loading the policy configuration…
            </p>
        );
    }

    // A category the backend does not list but the config restricts is a rule
    // in force, so it is shown rather than quietly dropped from the editor.
    const vocabulary = [
        ...new Set([
            ...categories.map((option) => option.category),
            ...Object.keys(draft.restricted_categories),
        ]),
    ];

    const toggleCategory = (category: string) => {
        const next = { ...draft.restricted_categories };

        if (category in next) {
            delete next[category];
        } else {
            next[category] =
                categories.find((option) => option.category === category)
                    ?.required_authority ?? "ROLE_CARGO_SUPERVISOR";
        }

        setDraft({ ...draft, restricted_categories: next });
    };

    const setAuthority = (category: string, authority: string) =>
        setDraft({
            ...draft,
            restricted_categories: {
                ...draft.restricted_categories,
                [category]: authority,
            },
        });

    return (
        <div className="rounded border border-[#E2E8F0] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                    Live Engine Policy
                </p>

                <span className="rounded-full border border-[#0D9488]/30 bg-[#F0FDFA] px-2 py-0.5 font-mono text-[10px] text-[#0F766E]">
                    APPLIES TO NEW DECISIONS
                </span>
            </div>

            <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                Restricted cargo categories
            </p>

            <div className="flex flex-col divide-y divide-[#F1F5F9] rounded border border-[#E2E8F0]">
                {vocabulary.map((category) => {
                    const authority = draft.restricted_categories[category] ?? "";
                    const restricted = category in draft.restricted_categories;

                    return (
                        <div
                            key={category}
                            className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                        >
                            <label className="flex min-w-0 flex-1 items-center gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={restricted}
                                    onChange={() => toggleCategory(category)}
                                    className="h-4 w-4 shrink-0 accent-[#0F766E]"
                                />

                                <span className="truncate font-mono text-[11px] text-[#0F172A]">
                                    {category}
                                </span>
                            </label>

                            {restricted ? (
                                <input
                                    aria-label={`Authority for ${category}`}
                                    value={authority}
                                    onChange={(event) =>
                                        setAuthority(category, event.target.value)
                                    }
                                    placeholder="ROLE_…"
                                    className="w-56 rounded border border-[#E2E8F0] px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-[#0D9488]"
                                />
                            ) : (
                                <span className="w-56 font-mono text-[10px] text-[#94A3B8]">
                                    releases automatically
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[#64748B]">
                A ticked category is never released on the engine&rsquo;s own
                authority: it is held for the role named beside it, whatever the
                declared value. An unticked one releases as soon as the network
                evidence passes.
            </p>

            {error && (
                <p className="mt-3 rounded border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 font-mono text-[11px] text-[#B91C1C]">
                    {error}
                </p>
            )}

            {note && !dirty && (
                <p className="mt-3 font-mono text-[11px] text-[#0F766E]">{note}</p>
            )}

            <div className="mt-4 flex items-center gap-2">
                <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || busy}
                    className="rounded bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0F766E] disabled:opacity-50"
                >
                    {busy ? "Applying…" : "Apply to Engine"}
                </button>

                <button
                    type="button"
                    onClick={() => setDraft(config)}
                    disabled={!dirty || busy}
                    className="rounded border border-[#E2E8F0] px-3 py-2 text-xs text-[#64748B] transition hover:border-[#CBD5E1] disabled:opacity-50"
                >
                    Discard
                </button>
            </div>
        </div>
    );
}

/** The sections the sidebar links to, in the order they appear on the page. */
const SECTION_IDS = ["general", "zones", "policies", "security", "notifications"];

function SettingsEditor({ initial }: { initial: Config }) {
    // `/settings` shows the whole console; `/settings#notifications` narrows it
    // to that one section. An unknown hash falls back to showing everything.
    const hash = useHash();
    const focused = SECTION_IDS.includes(hash) ? hash : null;

    // Dropping the hash without a reload; the store listens for hashchange.
    const showAllSections = () => {
        window.history.replaceState(null, "", window.location.pathname);
    };

    const [saved, setSaved] = useState<Config>(initial);
    const [draft, setDraft] = useState<Config>(initial);
    // Only zones a decision has actually targeted are real; the console does
    // not get to invent a perimeter the backend has never seen.
    const [zones, setZones] = useState<Zone[]>([]);
    const [zonesLoading, setZonesLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        listDecisionContexts({ limit: 500 })
            .then((contexts) => {
                if (cancelled) return;

                const totals = new Map<string, number>();
                for (const context of contexts) {
                    const zone = context.transaction?.zone;
                    if (!zone) continue;
                    totals.set(zone, (totals.get(zone) ?? 0) + 1);
                }

                setZones(
                    [...totals.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, count]) => ({
                            name,
                            code: `${count} DECISION${count === 1 ? "" : "S"} ON RECORD`,
                            type: "Geofence referenced by the policy engine",
                            staff: "—",
                            enabled: true,
                        }))
                );
            })
            .catch(() => {
                // The zone list is informational; a failure leaves it empty.
            })
            .finally(() => {
                if (!cancelled) setZonesLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);
    const [zoneFormOpen, setZoneFormOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        if (!toast) return;

        const id = window.setTimeout(() => setToast(null), 2600);
        return () => window.clearTimeout(id);
    }, [toast]);

    const dirty = useMemo(
        () => JSON.stringify(draft) !== JSON.stringify(saved),
        [draft, saved]
    );

    const commit = () => {
        setSaved(draft);

        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        } catch {
            // Storage can be unavailable; the in-memory state is still updated.
        }

        setToast("Configuration committed to node");
    };

    const revert = () => {
        setDraft(saved);
        setToast("Changes discarded");
    };

    const exportConfig = () => {
        const payload = JSON.stringify(
            { config: draft, zones, policies },
            null,
            2
        );

        const blob = new Blob([payload], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = "zonegate-config.json";
        link.click();

        URL.revokeObjectURL(url);
    };

    const addZone = (zone: Zone) => {
        setZones((current) => [...current, zone]);
        setZoneFormOpen(false);
        setToast(zone.name + " added");
    };

    const toggleZone = (name: string) => {
        setZones((current) =>
            current.map((zone) =>
                zone.name === name ? { ...zone, enabled: !zone.enabled } : zone
            )
        );
    };

    const renameZone = (name: string) => {
        const next = window.prompt("Zone designation", name);
        if (!next || !next.trim()) return;

        setZones((current) =>
            current.map((zone) =>
                zone.name === name ? { ...zone, name: next.trim() } : zone
            )
        );
        setToast("Zone renamed");
    };

    const defaultView = draft.defaultView;
    const setDefaultView = (value: string) =>
        setDraft((current) => ({ ...current, defaultView: value }));

    const notifications = draft.notifications;
    const setNotifications = (
        update: (previous: Config["notifications"]) => Config["notifications"]
    ) =>
        setDraft((current) => ({
            ...current,
            notifications: update(current.notifications),
        }));

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

            {/* PAGE HEADER */}
            <section className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-5 lg:flex-row lg:items-end">
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#64748B]">
                        <span>Configuration &amp; Policy Engine</span>
                        <span>{"//"}</span>
                        <span>NODE_T4_CONF</span>
                        <span>{"//"}</span>
                        <span className="font-semibold text-[#0D9488]">
                            System Integrity Verified
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-semibold uppercase tracking-tight text-[#0F172A]">
                            Settings
                        </h1>

                        <span className="hidden items-center gap-1.5 rounded border border-[#E2E8F0] bg-white px-2 py-1 font-mono text-[10px] sm:inline-flex">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0D9488]" />
                            SYS.NOMINAL
                        </span>
                    </div>

                    <p className="mt-2 text-sm text-[#64748B]">
                        Manage operational zones, authorization policies, security
                        boundaries, and gate access protocols.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={exportConfig}
                        className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition hover:border-[#0F172A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                    >
                        <Download size={15} className="text-[#64748B]" />
                        Export Config (.json)
                    </button>

                    <button
                        type="button"
                        onClick={commit}
                        disabled={!dirty}
                        className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition hover:border-[#0F172A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        <RefreshCw size={15} className="text-[#64748B]" />
                        {dirty ? "Commit Node" : "Node Committed"}
                    </button>
                </div>
            </section>

            <section className="flex flex-col">

                {focused && (
                    <button
                        type="button"
                        onClick={showAllSections}
                        className="mb-4 flex items-center gap-2 self-start rounded border border-[#E2E8F0] bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#0F172A] transition hover:border-[#0F172A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                    >
                        <ChevronLeft size={14} className="text-[#64748B]" />
                        All Settings
                    </button>
                )}

                <div className="flex flex-col gap-8">
                    {/* GENERAL */}
                    <SettingsSection
                        active={focused}
                        id="general"
                        icon={<Settings2 size={18} />}
                        title="General"
                        description="Manage primary enterprise identity, telemetry synchronization, and display metrics."
                        section="01"
                    >
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <Field label="Organization Name">
                                <input
                                    className={inputStyle}
                                    value={draft.organization}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            organization: event.target.value,
                                        }))
                                    }
                                />
                            </Field>

                            <Field label="Node Timezone Standard">
                                <select
                                    className={inputStyle}
                                    value={draft.timezone}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            timezone: event.target.value,
                                        }))
                                    }
                                >
                                    <option>
                                        UTC +03:00 (Kuwait, Riyadh, Nairobi)
                                    </option>
                                    <option>UTC +00:00 (London)</option>
                                    <option>UTC +04:00 (Dubai, Baku)</option>
                                    <option>UTC -05:00 (New York)</option>
                                </select>
                            </Field>

                            <Field label="Interface Locale & Encoding">
                                <select className={inputStyle}>
                                    <option>English (US) - UTF-8 Compliant</option>
                                    <option>English (UK) - Metric Port Standard</option>
                                    <option>French - Maritime Port Protocol</option>
                                    <option>German - DIN Standard</option>
                                </select>
                            </Field>

                            <Field label="Date & Time Precision">
                                <input
                                    className={inputStyle}
                                    defaultValue="DD/MM/YYYY · 24-hour (ISO 8601 Tabular)"
                                />
                            </Field>
                        </div>

                        <div>
                            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                                Default Request Ledger View
                            </p>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <RadioCard
                                    checked={defaultView === "all"}
                                    onChange={() => setDefaultView("all")}
                                    label="All Requests (Unified)"
                                />

                                <RadioCard
                                    checked={defaultView === "hold"}
                                    onChange={() => setDefaultView("hold")}
                                    label="Action Required (HOLD)"
                                />

                                <RadioCard
                                    checked={defaultView === "anomaly"}
                                    onChange={() => setDefaultView("anomaly")}
                                    label="Security Anomalies Only"
                                />
                            </div>
                        </div>

                        <SectionActions dirty={dirty} onSave={commit} onCancel={revert} />
                    </SettingsSection>

                    {/* LOCATIONS */}
                    <SettingsSection
                        active={focused}
                        id="zones"
                        icon={<MapPin size={18} />}
                        title="Locations & Zones"
                        description="Manage physical perimeter barriers, geofence anchors, and operational authorization zones."
                        action={
                            <button
                                type="button"
                                onClick={() => setZoneFormOpen(true)}
                                className={primaryButton}
                            >
                                <Plus size={15} />
                                Add Zone
                            </button>
                        }
                    >
                        <div className="overflow-x-auto rounded border border-[#E2E8F0]">
                            <table className="w-full min-w-[760px] text-left">
                                <thead>
                                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                                        {[
                                            "Zone Designation",
                                            "Perimeter Type",
                                            "Telemetry Status",
                                            "Auth. Personnel",
                                            "Controls",
                                        ].map((heading) => (
                                            <th
                                                key={heading}
                                                className="px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#64748B] last:text-right"
                                            >
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-[#E2E8F0]">
                                    {!zones.length && (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-xs text-[#64748B]"
                                            >
                                                {zonesLoading
                                                    ? "Loading zones from the decision log…"
                                                    : "No zone has been referenced by a decision yet."}
                                            </td>
                                        </tr>
                                    )}

                                    {zones.map((zone) => (
                                        <tr
                                            key={zone.name}
                                            className={`transition hover:bg-[#F8FAFC] ${zone.enabled ? "" : "opacity-55"}`}
                                        >
                                            <td className="px-4 py-3">
                                                <p className="font-mono text-xs font-semibold">
                                                    {zone.name}
                                                </p>
                                                <p className="font-mono text-[10px] text-[#64748B]">
                                                    {zone.code}
                                                </p>
                                            </td>

                                            <td className="px-4 py-3 text-xs text-[#64748B]">
                                                {zone.type}
                                            </td>

                                            <td className="px-4 py-3">
                                                <ActiveBadge enabled={zone.enabled} />
                                            </td>

                                            <td className="px-4 py-3 text-right font-mono text-xs">
                                                {zone.staff}
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => renameZone(zone.name)}
                                                        className="rounded px-2 py-1 font-mono text-[10px] hover:bg-[#F1F5F9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                                                    >
                                                        Edit
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => toggleZone(zone.name)}
                                                        className="rounded px-2 py-1 font-mono text-[10px] text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#DC2626] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                                                    >
                                                        {zone.enabled ? "Disable" : "Enable"}
                                                    </button>

                                                    <button
                                                        aria-label="Zone options"
                                                        className="rounded p-1 text-[#64748B] hover:bg-[#F1F5F9]"
                                                    >
                                                        <MoreHorizontal size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SettingsSection>

                    {/* POLICIES */}
                    <SettingsSection
                        active={focused}
                        id="policies"
                        icon={<Gavel size={18} />}
                        title="Authorization Policies"
                        description="Thresholds an operations lead can retune. The rules themselves are owned by the deterministic engine."
                        action={
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setToast(
                                            "Policy rules are owned by the deterministic engine and are read-only here"
                                        )
                                    }
                                    className={secondaryButton}
                                >
                                    Edit Policy
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setToast(
                                            "Rule authoring ships with the policy engine console"
                                        )
                                    }
                                    className={primaryButton}
                                >
                                    <Plus size={15} />
                                    Create Rule
                                </button>
                            </div>
                        }
                    >
                        <PolicyThresholds />

                        <div className="flex gap-3 rounded-r border-l-2 border-[#0D9488] bg-[#F8FAFC] p-4">
                            <ShieldCheck
                                size={19}
                                className="shrink-0 text-[#0D9488]"
                            />

                            <div>
                                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider">
                                    Deterministic Execution Assurance
                                </p>

                                <p className="mt-1 font-mono text-[11px] leading-relaxed text-[#64748B]">
                                    All decisions are strictly computed against mathematical
                                    authorization rules and verified cryptographic telemetry.
                                    Automated AI policy mutation is permanently disabled.
                                </p>
                            </div>
                        </div>

                        <div className="rounded border border-[#E2E8F0] p-5">
                            <div className="flex flex-col justify-between gap-2 border-b border-[#E2E8F0] pb-3 sm:flex-row sm:items-center">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-semibold uppercase">
                                        Cargo Handoff
                                    </h3>

                                    <span className="rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-[10px] text-[#64748B]">
                                        POL-SEC-902
                                    </span>
                                </div>

                                <span className="font-mono text-[10px] uppercase text-[#64748B]">
                                    Evaluation Weight: 100% Strict
                                </span>
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
                                <div>
                                    <p className="mb-2 font-mono text-[10px] font-semibold uppercase text-[#64748B]">
                                        Mandatory Telemetry Evidence
                                    </p>

                                    <div className="flex flex-wrap gap-2">
                                        <EvidenceTag required>
                                            Number Verification
                                        </EvidenceTag>

                                        <EvidenceTag required>
                                            Location Verification
                                        </EvidenceTag>
                                    </div>
                                </div>

                                <div>
                                    <p className="mb-2 font-mono text-[10px] font-semibold uppercase text-[#64748B]">
                                        Optional Supplemental Checks
                                    </p>

                                    <div className="flex flex-wrap gap-2">
                                        <EvidenceTag>SIM Swap Check</EvidenceTag>
                                        <EvidenceTag>Device Swap Check</EvidenceTag>
                                        <EvidenceTag>Reachability Ping</EvidenceTag>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <p className="mb-2 font-mono text-[10px] font-semibold uppercase text-[#64748B]">
                                    Deterministic Decision Matrix
                                </p>

                                <div className="overflow-hidden rounded border border-[#E2E8F0]">
                                    {policies.map((policy) => (
                                        <div
                                            key={policy.id}
                                            className="flex flex-col justify-between gap-2 border-b border-[#E2E8F0] p-3 last:border-b-0 sm:flex-row sm:items-center"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-[10px] text-[#94A3B8]">
                                                    {policy.id}
                                                </span>

                                                <span className="font-mono text-[11px]">
                                                    {policy.rule}
                                                </span>
                                            </div>

                                            <DecisionBadge decision={policy.decision} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </SettingsSection>

                    {/* SECURITY */}
                    <SettingsSection
                        active={focused}
                        id="security"
                        icon={<Lock size={18} />}
                        title="Security"
                        description="Configure system-level boundaries, credential enforcement, and manual override safeguards."
                        section="04"
                    >

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <EnforcedCard
                                title="Deterministic Policy Enforcement"
                                description="The agent's assessment is advisory input. It cannot reach or change a decision."
                            />

                            <EnforcedCard
                                title="Human Approval for HOLD"
                                description="A HOLD is only ever cleared by a named authority; the engine never resolves one itself."
                            />

                            <EnforcedCard
                                title="Trusted Device Binding"
                                description="Every carrier call is made against the actor's bound device, or the request is denied."
                            />

                            <EnforcedCard
                                title="Evidence Before Decision"
                                description="A decision is only reached once the Gateway has returned its evidence."
                            />
                        </div>

                        <p className="text-xs leading-relaxed text-[#64748B]">
                            These are structural properties of the pipeline, not
                            options. They are shown here so an auditor can see
                            what the system guarantees; there is nothing to
                            switch off.
                        </p>

                        <div className="rounded border border-[#FEE2E2] bg-[#FEF2F2] p-4">
                            <p className="font-mono text-[10px] font-semibold uppercase text-[#B91C1C]">
                                Critical Security Boundary
                            </p>

                            <p className="mt-1 text-xs text-[#64748B]">
                                Policy engine integrity, cryptographic evidence requirements,
                                and manual authority boundaries cannot be disabled remotely.
                            </p>
                        </div>

                        <SectionActions dirty={dirty} onSave={commit} onCancel={revert} />
                    </SettingsSection>

                    {/* NOTIFICATIONS */}
                    <SettingsSection
                        active={focused}
                        id="notifications"
                        icon={<Bell size={18} />}
                        title="Notifications"
                        description="Define operator alerts for authorization decisions, node health, and policy changes."
                        section="05"
                    >
                        <div className="divide-y divide-[#E2E8F0] rounded border border-[#E2E8F0]">
                            <NotificationRow
                                title="Denied Request Alert"
                                description="Send an immediate operator notification when deterministic policy returns DENY."
                                checked={notifications.denied}
                                onChange={() =>
                                    setNotifications((prev) => ({
                                        ...prev,
                                        denied: !prev.denied,
                                    }))
                                }
                            />

                            <NotificationRow
                                title="HOLD Review Required"
                                description="Notify authorized supervisors when human review is required."
                                checked={notifications.hold}
                                onChange={() =>
                                    setNotifications((prev) => ({
                                        ...prev,
                                        hold: !prev.hold,
                                    }))
                                }
                            />

                            <NotificationRow
                                title="Node Connectivity Failure"
                                description="Raise an operational alert when an evidence or gate node becomes unavailable."
                                checked={notifications.nodeOffline}
                                onChange={() =>
                                    setNotifications((prev) => ({
                                        ...prev,
                                        nodeOffline: !prev.nodeOffline,
                                    }))
                                }
                            />

                            <NotificationRow
                                title="Policy Configuration Change"
                                description="Notify administrators after authorization rules are modified."
                                checked={notifications.policyChanges}
                                onChange={() =>
                                    setNotifications((prev) => ({
                                        ...prev,
                                        policyChanges: !prev.policyChanges,
                                    }))
                                }
                            />
                        </div>

                        <div className="flex flex-col justify-between gap-3 rounded border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:flex-row sm:items-center">
                            <div>
                                <p className="font-mono text-[10px] font-semibold uppercase">
                                    Alert Destination
                                </p>
                                <p className="mt-1 font-mono text-[10px] text-[#64748B]">
                                    SECURITY_OPS_CHANNEL // TERMINAL-04
                                </p>
                            </div>

                            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-[#0D9488]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#1FD1A8]" />
                                7 ACTIVE RULES
                            </span>
                        </div>

                        <SectionActions dirty={dirty} onSave={commit} onCancel={revert} />
                    </SettingsSection>
                </div>
            </section>

            {zoneFormOpen && (
                <ZoneComposer
                    onCancel={() => setZoneFormOpen(false)}
                    onSubmit={addZone}
                />
            )}
        </div>
    );
}

const inputStyle =
    "h-9 w-full rounded border border-[#CBD5E1] bg-white px-3 font-mono text-[11px] text-[#0F172A] outline-none transition focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/15";

const primaryButton =
    "flex items-center gap-1.5 rounded bg-[#0D9488] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white transition hover:bg-[#0F766E]";

const secondaryButton =
    "rounded border border-[#E2E8F0] bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#0F172A] transition hover:border-[#94A3B8] hover:bg-[#F8FAFC]";

function SettingsSection({
    id,
    active,
    icon,
    title,
    description,
    section,
    action,
    children,
}: {
    id: string;
    /** Section selected by the URL hash, or null when the page shows them all. */
    active?: string | null;
    icon: React.ReactNode;
    title: string;
    description: string;
    section?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    // Hidden rather than unmounted, so an unsaved draft survives a detour
    // through another section.
    return (
        <section
            id={id}
            hidden={active != null && active !== id}
            className="scroll-mt-24 rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-sm"
        >
            <div className="mb-5 flex flex-col justify-between gap-3 border-b border-[#E2E8F0] pb-4 sm:flex-row sm:items-start">
                <div>
                    <div className="flex items-center gap-2 text-[#0D9488]">
                        {icon}

                        <h2 className="text-lg font-semibold uppercase text-[#0F172A]">
                            {title}
                        </h2>
                    </div>

                    <p className="mt-1 text-xs text-[#64748B]">
                        {description}
                    </p>
                </div>

                {action ? (
                    action
                ) : section ? (
                    <span className="rounded border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 font-mono text-[10px] text-[#64748B]">
                        SECTION // {section}
                    </span>
                ) : null}
            </div>

            <div className="flex flex-col gap-5">{children}</div>
        </section>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                {label}
            </span>

            {children}
        </label>
    );
}

function RadioCard({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: () => void;
    label: string;
}) {
    return (
        <label
            className={`flex cursor-pointer items-center gap-2 rounded border p-3 transition ${checked
                    ? "border-[#0D9488] bg-[#F0FDFA]"
                    : "border-[#CBD5E1] bg-white hover:border-[#94A3B8]"
                }`}
        >
            <input
                type="radio"
                checked={checked}
                onChange={onChange}
                className="accent-[#0D9488]"
            />

            <span className="font-mono text-[11px]">
                {label}
            </span>
        </label>
    );
}

function SectionActions({
    dirty,
    onSave,
    onCancel,
}: {
    dirty: boolean;
    onSave: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E2E8F0] pt-4">
            {dirty && (
                <span className="mr-auto font-mono text-[10px] uppercase tracking-wider text-[#B45309]">
                    Uncommitted changes
                </span>
            )}

            <button
                type="button"
                onClick={onCancel}
                disabled={!dirty}
                className={`${secondaryButton} disabled:cursor-not-allowed disabled:opacity-45`}
            >
                Cancel
            </button>

            <button
                type="button"
                onClick={onSave}
                disabled={!dirty}
                className={`${primaryButton} disabled:cursor-not-allowed disabled:opacity-45`}
            >
                Save Changes
            </button>
        </div>
    );
}

function ZoneComposer({
    onCancel,
    onSubmit,
}: {
    onCancel: () => void;
    onSubmit: (zone: Zone) => void;
}) {
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [type, setType] = useState("Port Turnstile & Barrier");
    const [staff, setStaff] = useState("0");

    const valid = name.trim().length > 1 && code.trim().length > 1;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/60 p-4 sm:items-center"
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Add operational zone"
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-md rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-xl"
            >
                <h2 className="text-lg font-semibold">Add Operational Zone</h2>

                <form
                    className="mt-4 flex flex-col gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!valid) return;

                        onSubmit({
                            name: name.trim(),
                            code: code.trim().toUpperCase(),
                            type,
                            staff: `${staff} Staff`,
                            enabled: true,
                        });
                    }}
                >
                    <Field label="Zone Designation">
                        <input
                            className={inputStyle}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Port Gate 18"
                        />
                    </Field>

                    <Field label="Perimeter Code">
                        <input
                            className={inputStyle}
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            placeholder="BERTH-C // LANES 01-02"
                        />
                    </Field>

                    <Field label="Perimeter Type">
                        <select
                            className={inputStyle}
                            value={type}
                            onChange={(event) => setType(event.target.value)}
                        >
                            <option>Port Turnstile &amp; Barrier</option>
                            <option>High-Density Warehouse</option>
                            <option>Loading &amp; Staging Area</option>
                        </select>
                    </Field>

                    <Field label="Authorized Personnel">
                        <input
                            className={inputStyle}
                            type="number"
                            min="0"
                            value={staff}
                            onChange={(event) => setStaff(event.target.value)}
                        />
                    </Field>

                    <div className="mt-2 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className={secondaryButton}
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={!valid}
                            className={`${primaryButton} disabled:cursor-not-allowed disabled:opacity-45`}
                        >
                            Add Zone
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ActiveBadge({ enabled = true }: { enabled?: boolean }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 font-mono text-[9px] font-semibold uppercase">
            <span
                className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-[#0D9488]" : "bg-[#94A3B8]"}`}
            />
            {enabled ? "Active" : "Disabled"}
        </span>
    );
}

function EvidenceTag({
    children,
    required,
}: {
    children: React.ReactNode;
    required?: boolean;
}) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] ${required
                    ? "border-[#0D9488] bg-[#F0FDFA] text-[#0F172A]"
                    : "border-[#E2E8F0] bg-white text-[#64748B]"
                }`}
        >
            {required && (
                <CheckSquare size={13} className="text-[#0D9488]" />
            )}

            {children}
        </span>
    );
}

function DecisionBadge({
    decision,
}: {
    decision: string;
}) {
    const style =
        decision === "APPROVE"
            ? "border-[#CCFBF1] bg-[#F0FDFA] text-[#0F766E]"
            : decision === "HOLD"
                ? "border-[#FEF3C7] bg-[#FFFBEB] text-[#B45309]"
                : "border-[#FEE2E2] bg-[#FEF2F2] text-[#B91C1C]";

    const dot =
        decision === "APPROVE"
            ? "bg-[#0D9488]"
            : decision === "HOLD"
                ? "bg-[#D97706]"
                : "bg-[#DC2626]";

    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9px] font-semibold ${style}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {decision}
        </span>
    );
}

/** A property the pipeline always enforces — shown, never toggled. */
function EnforcedCard({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className="rounded border border-[#CCFBF1] bg-[#F0FDFA] p-4">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-[#0F172A]">{title}</p>

                <span className="shrink-0 rounded-full border border-[#0D9488]/30 bg-white px-2 py-0.5 font-mono text-[10px] text-[#0F766E]">
                    ENFORCED
                </span>
            </div>

            <p className="mt-1 text-xs leading-relaxed text-[#64748B]">
                {description}
            </p>
        </div>
    );
}

function NotificationRow({
    title,
    description,
    checked,
    onChange,
}: {
    title: string;
    description: string;
    checked: boolean;
    onChange: () => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 p-4">
            <div>
                <p className="text-xs font-semibold">{title}</p>

                <p className="mt-1 text-[11px] text-[#64748B]">
                    {description}
                </p>
            </div>

            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

function Toggle({
    checked,
    onChange,
}: {
    checked: boolean;
    onChange: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={checked}
            onClick={onChange}
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-[#0D9488]" : "bg-[#CBD5E1]"
                }`}
        >
            <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-[18px]" : "left-0.5"
                    }`}
            />
        </button>
    );
}