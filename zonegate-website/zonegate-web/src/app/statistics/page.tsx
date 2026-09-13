"use client";

import {
    BarChart3,
    Building2,
    Download,
    History,
    PieChart as PieChartIcon,
    ShieldAlert,
    Smartphone,
} from "lucide-react";
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import {
    ApiError,
    listDecisionContexts,
    type DecisionContext,
} from "@/lib/api";
import {
    countByOutcome,
    effectiveOutcome,
    formatWait,
    resolutionLatency,
    shortTime,
} from "@/lib/derive";
import {
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

/* ------------------------------------------------------------------ *
 * Everything on this page is projected from the decision log.
 *
 * The API stores decisions, not analytics: no per-zone rollup, no daily
 * counters, no incident feed. Those are built here from
 * `/v1/authorizations/contexts`, so any figure on screen can be traced back
 * to the decisions that produced it — and a zone only appears once a
 * decision has actually targeted it.
 * ------------------------------------------------------------------ */

type Zone = string;

/** Colours cycle by position so a new zone still gets a stable slot. */
const ZONE_COLORS = ["#0F172A", "#0D9488", "#475569", "#94A3B8", "#B45309", "#1D4ED8"];

function zoneColor(index: number): string {
    return ZONE_COLORS[index % ZONE_COLORS.length];
}

type Bucket = {
    label: string;
    zone: Zone;
    approved: number;
    hold: number;
    denied: number;
};

type Incident = {
    id: string;
    employee: string;
    resource: string;
    zone: Zone;
    reason: string;
    decision: "DENIED" | "HOLD";
    time: string;
    daysAgo: number;
    flag: FlagCode;
};

/** The failure categories the collected evidence can actually distinguish. */
type FlagCode =
    | "LOCATION"
    | "NUMBER"
    | "SIM_SWAP"
    | "DEVICE_SWAP"
    | "PERMISSION"
    | "CATEGORY"
    | "WINDOW";

const FLAG_LABELS: Record<FlagCode, { title: string; description: string }> = {
    LOCATION: {
        title: "Location Mismatch",
        description: "Device outside the authorized geofence",
    },
    NUMBER: {
        title: "Number Mismatch",
        description: "Carrier record disagreed with the enrolled number",
    },
    SIM_SWAP: {
        title: "Recent SIM Swap",
        description: "Carrier IMSI reset inside the guard window",
    },
    DEVICE_SWAP: {
        title: "Recent Device Swap",
        description: "Subscriber moved to different hardware",
    },
    PERMISSION: {
        title: "Permission Denied",
        description: "Actor lacked the permission the action requires",
    },
    CATEGORY: {
        title: "Restricted Category",
        description: "Cargo category that only a named authority may release",
    },
    WINDOW: {
        title: "Out of Window",
        description: "Release requested outside operational hours",
    },
};

/** Reads the failure category out of the evidence, falling back to the reason. */
function flagFor(context: DecisionContext): FlagCode {
    const evidence = context.evidence;
    const reason = (context.decision.reasons[0] ?? "").toLowerCase();

    if (evidence?.location_verified === false) return "LOCATION";
    if (evidence?.number_verified === false) return "NUMBER";
    if (evidence?.recent_sim_swap === true) return "SIM_SWAP";
    if (evidence?.recent_device_swap === true) return "DEVICE_SWAP";
    if (reason.includes("permission")) return "PERMISSION";
    if (reason.includes("category")) return "CATEGORY";
    return "WINDOW";
}

function daysBetween(iso: string): number {
    const then = new Date(iso).getTime();
    return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Daily buckets per zone, oldest first, covering the last `span` days. */
function dailyBuckets(
    contexts: DecisionContext[],
    zones: Zone[],
    span: number,
    endDate: string
): Bucket[] {
    const rows: Bucket[] = [];

    for (let day = span - 1; day >= 0; day--) {
        if (!endDate) break;
        const date = new Date(`${endDate}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - day);
        const label = date.toISOString().slice(0, 10);

        for (const zone of zones) {
            const matching = contexts.filter(
                (context) =>
                    context.transaction?.zone === zone &&
                    new Date(context.decision.decided_at).toISOString().slice(0, 10) === label
            );

            const counts = countByOutcome(matching);

            rows.push({
                label,
                zone,
                approved: counts.APPROVE,
                hold: counts.HOLD,
                denied: counts.DENY,
            });
        }
    }

    return rows;
}

/** Two-hour buckets per zone across today. */
function hourlyBuckets(contexts: DecisionContext[], zones: Zone[]): Bucket[] {
    const rows: Bucket[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (let slot = 0; slot < 12; slot++) {
        const hour = slot * 2;
        const label = `${String(hour).padStart(2, "0")}:00`;

        for (const zone of zones) {
            const matching = contexts.filter((context) => {
                if (context.transaction?.zone !== zone) return false;

                const decidedAt = context.decision.decided_at;
                if (decidedAt.slice(0, 10) !== today) return false;

                const decidedHour = new Date(decidedAt).getUTCHours();
                return decidedHour >= hour && decidedHour < hour + 2;
            });

            const counts = countByOutcome(matching);

            rows.push({
                label,
                zone,
                approved: counts.APPROVE,
                hold: counts.HOLD,
                denied: counts.DENY,
            });
        }
    }

    return rows;
}

function toIncidents(contexts: DecisionContext[]): Incident[] {
    return contexts
        .filter((context) => effectiveOutcome(context.decision) !== "APPROVE")
        .map((context) => {
            const decision = context.decision;

            return {
                id: decision.decision_id,
                employee: context.transaction?.actor_id ?? "—",
                resource: context.transaction?.resource_id ?? "—",
                zone: context.transaction?.zone ?? "—",
                reason: decision.reasons[0] ?? "No reason recorded",
                decision:
                    effectiveOutcome(decision) === "DENY"
                        ? ("DENIED" as const)
                        : ("HOLD" as const),
                time: shortTime(decision.decided_at).slice(0, 5),
                daysAgo: daysBetween(decision.decided_at),
                flag: flagFor(context),
            };
        });
}

/* ------------------------------------------------------------------ *
 * Every panel on this page, the activity chart included, reads from the
 * single page-wide period filter in the header. The counts are projected
 * from the decision log, so an empty stretch of calendar reads as zero
 * rather than being dropped.
 * ------------------------------------------------------------------ */

const isoDay = (value: Date) => value.toISOString().slice(0, 10);
const noopSubscribe = () => () => {};
function useToday() {
    return useSyncExternalStore(noopSubscribe, () => isoDay(new Date()), () => "");
}

const PERIOD_META = {
    Today: { take: 12, cycle: "24-HOUR TRAJECTORY", tag: "1D", hourly: true },
    "Last 7 Days": { take: 7, cycle: "7-DAY TRAJECTORY", tag: "7D", hourly: false },
    "Last 30 Days": { take: 30, cycle: "30-DAY TRAJECTORY", tag: "30D", hourly: false },
    "Custom Date": { take: 7, cycle: "CUSTOM WINDOW", tag: "CUSTOM", hourly: false },
} as const;

type PeriodKey = keyof typeof PERIOD_META;

const timeFilters = Object.keys(PERIOD_META) as PeriodKey[];

const PAGE_SIZE = 5;

const nf = new Intl.NumberFormat("en-US");

function pct(part: number, whole: number) {
    if (!whole) return "0.0%";
    return `${((part / whole) * 100).toFixed(1)}%`;
}

export default function StatisticsPage() {
    const [timeFilter, setTimeFilter] = useState<PeriodKey>("Last 7 Days");
    const [location, setLocation] = useState<"All Locations" | Zone>("All Locations");
    const [page, setPage] = useState(0);

    // The table only ever holds non-approved decisions; this narrows it further.
    const [outcome, setOutcome] = useState<"ALL" | "DENIED" | "HOLD">("ALL");

    const [contexts, setContexts] = useState<DecisionContext[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);


    // The chart is anchored on today until the reader picks another date.
    const today = useToday();
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [appliedRange, setAppliedRange] = useState<{ start: string; end: string } | null>(null);
    const customError = !customStart || !customEnd ? "Select both dates." : customStart > customEnd ? "Start date must be on or before end date." : "";
    // The pickers are only on screen while a range is being chosen; applying
    // one puts them away again. Pressing "Custom Date" brings them back.
    const [rangeEditorOpen, setRangeEditorOpen] = useState(false);

    const [chartZoom, setChartZoom] = useState(1);
    const [chartPan, setChartPan] = useState(0);
    const dragStart = useRef<number | null>(null);
    const panStart = useRef(0);

    useEffect(() => {
        let cancelled = false;

        listDecisionContexts({ limit: 500 })
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
                        : "Unexpected error loading decision analytics"
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const rangeEnd = timeFilter === "Custom Date" && appliedRange ? appliedRange.end : today;
    const rangeStart = timeFilter === "Custom Date" && appliedRange ? appliedRange.start : today ? (() => {
        const start = new Date(`${today}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - (timeFilter === "Today" ? 0 : PERIOD_META[timeFilter].take - 1));
        return isoDay(start);
    })() : "";
    const period = { ...PERIOD_META[timeFilter], take: timeFilter === "Custom Date" && appliedRange
        ? Math.round((Date.parse(appliedRange.end) - Date.parse(appliedRange.start)) / 86400000) + 1
        : PERIOD_META[timeFilter].take };
    const periodContexts = useMemo(() => contexts.filter((context) => {
        const stamp = Date.parse(context.decision.decided_at);
        return stamp >= Date.parse(`${rangeStart}T00:00:00Z`) && stamp < Date.parse(`${rangeEnd}T00:00:00Z`) + 86400000;
    }), [contexts, rangeStart, rangeEnd]);

    // Only zones a decision has actually targeted appear in the breakdown.
    const zones = useMemo(() => {
        const found = new Set<Zone>();
        for (const context of contexts) {
            if (context.transaction?.zone) found.add(context.transaction.zone);
        }
        return [...found].sort();
    }, [contexts]);

    const source = useMemo(
        () =>
            period.hourly
                ? hourlyBuckets(periodContexts, zones)
                : dailyBuckets(periodContexts, zones, period.take, rangeEnd),
        [periodContexts, zones, period.hourly, period.take, rangeEnd]
    );


    const incidentSource = useMemo(() => toIncidents(periodContexts), [periodContexts]);

    const latency = useMemo(() => resolutionLatency(periodContexts.filter((context) => location === "All Locations" || context.transaction?.zone === location)), [periodContexts, location]);

    const data = useMemo(() => {
        const take = period.take;

        // Keep only the most recent `take` label groups.
        const labels = [...new Set(source.map((row) => row.label))].slice(-take);
        const labelSet = new Set(labels);

        const inPeriod = source.filter((row) => labelSet.has(row.label));

        const inScope =
            location === "All Locations"
                ? inPeriod
                : inPeriod.filter((row) => row.zone === location);

        // Activity series, aggregated across the zones in scope.
        const series = labels.map((label) => {
            const rows = inScope.filter((row) => row.label === label);

            return {
                day: label,
                approved: rows.reduce((sum, row) => sum + row.approved, 0),
                hold: rows.reduce((sum, row) => sum + row.hold, 0),
                denied: rows.reduce((sum, row) => sum + row.denied, 0),
            };
        });

        const approved = inScope.reduce((sum, row) => sum + row.approved, 0);
        const hold = inScope.reduce((sum, row) => sum + row.hold, 0);
        const denied = inScope.reduce((sum, row) => sum + row.denied, 0);
        const total = approved + hold + denied;

        // Per-zone totals always cover every zone in the period, so the
        // breakdown still reads as a distribution when one zone is selected.
        const zoneTotals = zones.map((zone, index) => {
            const rows = inPeriod.filter((row) => row.zone === zone);
            const value = rows.reduce(
                (sum, row) => sum + row.approved + row.hold + row.denied,
                0
            );

            return { zone, value, label: zone, color: zoneColor(index) };
        });

        const zoneSum = zoneTotals.reduce((sum, row) => sum + row.value, 0);


        const incidents = incidentSource.filter((incident) => {
            const zoneMatch =
                location === "All Locations" || incident.zone === location;

            return zoneMatch;
        });

        const flagCounts = (Object.keys(FLAG_LABELS) as FlagCode[]).map(
            (flag) => ({
                flag,
                ...FLAG_LABELS[flag],
                value: incidents.filter((incident) => incident.flag === flag).length,
            })
        );

        return {
            series,
            approved,
            hold,
            denied,
            total,
            zoneTotals,
            zoneSum,
            incidents,
            flagCounts,
        };
    }, [period, location, source, zones, incidentSource]);

    // The chart follows the page-wide period filter; it has no window of its own.
    const activity = { points: data.series, start: rangeStart, end: rangeEnd, available: data.total };

    const deniedCount = data.incidents.filter(
        (incident) => incident.decision === "DENIED"
    ).length;

    const holdCount = data.incidents.length - deniedCount;

    const filteredIncidents =
        outcome === "ALL"
            ? data.incidents
            : data.incidents.filter((incident) => incident.decision === outcome);

    const pageCount = Math.max(1, Math.ceil(filteredIncidents.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const visibleIncidents = filteredIncidents.slice(
        safePage * PAGE_SIZE,
        safePage * PAGE_SIZE + PAGE_SIZE
    );

    const changeOutcome = (next: "ALL" | "DENIED" | "HOLD") => {
        setOutcome(next);
        setPage(0);
    };

    const changeFilter = (next: PeriodKey) => {
        setTimeFilter(next);
        setChartPan(0);
        setChartZoom(1);
        setPage(0);
        setRangeEditorOpen(next === "Custom Date");
        if (next === "Custom Date" && !appliedRange && today) {
            const start = new Date(`${today}T00:00:00Z`);
            start.setUTCDate(start.getUTCDate() - 6);
            const first = isoDay(start);
            setCustomStart(first); setCustomEnd(today);
            setAppliedRange({ start: first, end: today });
        }
    };

    const changeLocation = (next: "All Locations" | Zone) => {
        setLocation(next);
        setPage(0);
    };

    const exportCsv = () => {
        const header = [
            "period",
            "location",
            "bucket",
            "approved",
            "on_hold",
            "denied",
        ];

        const rows = data.series.map((row) => [
            timeFilter,
            location,
            row.day,
            row.approved,
            row.hold,
            row.denied,
        ]);

        const csv = [header, ...rows]
            .map((row) => row.join(","))
            .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `zonegate-statistics-${period.tag.toLowerCase()}.csv`;
        link.click();

        URL.revokeObjectURL(url);
    };

    const decisionData = [
        { name: "Approved", value: data.approved, color: "#0D9488" },
        { name: "On Hold", value: data.hold, color: "#D97706" },
        { name: "Denied", value: data.denied, color: "#DC2626" },
    ];

    const peakZone: { label: string } | undefined = [...data.zoneTotals].sort(
        (a, b) => b.value - a.value
    )[0];

    return (
        <div className="flex w-full flex-col gap-6">
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

            {loading && !contexts.length && (
                <p className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 font-mono text-[11px] text-[#64748B]">
                    Loading decision analytics…
                </p>
            )}

            <section className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-4 lg:flex-row lg:items-end">
                <div>
                    <div className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                            Metrics & Audit
                        </span>

                        <span className="text-[10px] text-[#64748B]">•</span>

                        <span className="rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 font-mono text-[10px] text-[#0F172A]">
                            NODE_T4_STAT
                        </span>
                    </div>

                    <h1 className="text-3xl font-semibold tracking-tight text-[#0F172A]">
                        Statistics
                    </h1>

                    <p className="mt-1 text-sm text-[#64748B]">
                        Overview of authorization requests and security decisions across
                        active telemetry feeds.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center rounded border border-[#E2E8F0] bg-[#F1F5F9] p-0.5">
                        {timeFilters.map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => changeFilter(item)}
                                aria-pressed={timeFilter === item}
                                className={`rounded px-3 py-1.5 text-[10px] font-semibold uppercase transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] ${timeFilter === item
                                    ? "bg-[#0D9488] text-white"
                                    : "text-[#0F172A] hover:text-[#0D9488]"
                                    }`}
                            >
                                {item}
                            </button>
                        ))}
                    </div>

                    <select
                        value={location}
                        onChange={(event) =>
                            changeLocation(event.target.value as "All Locations" | Zone)
                        }
                        aria-label="Filter by location"
                        className="rounded border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-[11px] text-[#0F172A] outline-none focus:border-[#0D9488]"
                    >
                        <option>All Locations</option>
                        {zones.map((zone) => (
                            <option key={zone}>{zone}</option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={exportCsv}
                        className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-white px-3 py-2 text-[10px] font-semibold uppercase text-[#0F172A] transition hover:border-[#0D9488] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                    >
                        <Download size={15} className="text-[#64748B]" />
                        Export CSV
                    </button>
                </div>
            </section>

            {timeFilter === "Custom Date" && rangeEditorOpen && <form onSubmit={(event) => {
                event.preventDefault();
                if (customError) return;
                setAppliedRange({ start: customStart, end: customEnd });
                setChartPan(0);
                setChartZoom(1);
                setPage(0);
                setRangeEditorOpen(false);
            }} className="flex flex-wrap items-end gap-4 rounded-lg border border-[#E2E8F0] bg-white p-4">
                <label className="flex flex-col gap-2 text-sm text-[#475569]">Start date (UTC)
                    <input type="date" required value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="rounded border border-[#CBD5E1] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
                </label>
                <label className="flex flex-col gap-2 text-sm text-[#475569]">End date (UTC)
                    <input type="date" required value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="rounded border border-[#CBD5E1] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
                </label>
                <button type="submit" disabled={Boolean(customError)} className="rounded bg-[#0D9488] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F766E] disabled:opacity-50">Apply dates</button>
                {customError && <p role="alert" className="w-full text-sm text-[#B91C1C]">{customError}</p>}
            </form>}
            <p aria-live="polite" className="text-sm text-[#64748B]">{rangeStart} — {rangeEnd} (UTC). Statistics cover the latest 500 loaded decisions.</p>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    label="Total Requests"
                    value={nf.format(data.total)}
                    meta={`${timeFilter} · ${location}`}
                    icon={<BarChart3 size={17} />}
                />

                <SummaryCard
                    label="Approved"
                    value={nf.format(data.approved)}
                    meta={`${pct(data.approved, data.total)} gross throughput`}
                    status="APPROVED"
                />

                <SummaryCard
                    label="On Hold"
                    value={nf.format(data.hold)}
                    meta={`${pct(data.hold, data.total)} pending resolution`}
                    status="ON HOLD"
                />

                <SummaryCard
                    label="Denied"
                    value={nf.format(data.denied)}
                    meta={`${pct(data.denied, data.total)} security rejections`}
                    status="DENIED"
                />
            </section>

            <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                    <div className="flex items-center gap-2">
                        <PieChartIcon size={18} className="text-[#64748B]" />

                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0F172A]">
                            Authorization Decisions Breakdown
                        </span>
                    </div>

                    <span className="font-mono text-[10px] text-[#64748B]">
                        METRIC_SET: DISPATCH_ACCURACY // N={data.total}
                    </span>
                </div>

                <div className="grid grid-cols-1 items-center gap-8 py-5 lg:grid-cols-12">
                    <div className="relative h-72 lg:col-span-5">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={decisionData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={82}
                                    outerRadius={105}
                                    dataKey="value"
                                    stroke="none"
                                    isAnimationActive={false}
                                >
                                    {decisionData.map((entry) => (
                                        <Cell key={entry.name} fill={entry.color} />
                                    ))}
                                </Pie>

                                <Tooltip
                                    contentStyle={{
                                        border: "1px solid #E2E8F0",
                                        borderRadius: "6px",
                                        fontSize: "11px",
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>

                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-semibold text-[#0F172A]">
                                {nf.format(data.total)}
                            </span>

                            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                                Total Requests
                            </span>

                            <span className="mt-1 font-mono text-[10px] text-[#94A3B8]">
                                {location === "All Locations"
                                    ? "BERTH_B"
                                    : location.toUpperCase().replace(/ /g, "_")}{" "}
                                / {period.tag}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-5 lg:col-span-7">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <DecisionCard
                                label="Approved"
                                value={nf.format(data.approved)}
                                meta={`${pct(data.approved, data.total)} clearance share`}
                                color="#0D9488"
                            />

                            <DecisionCard
                                label="On Hold"
                                value={nf.format(data.hold)}
                                meta={`${pct(data.hold, data.total)} pending protocol`}
                                color="#D97706"
                            />

                            <DecisionCard
                                label="Denied"
                                value={nf.format(data.denied)}
                                meta={`${pct(data.denied, data.total)} security lockout`}
                                color="#DC2626"
                            />
                        </div>

                        <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2">
                                <span className="text-[10px] font-semibold uppercase text-[#0F172A]">
                                    Operational Telemetry Diagnostics
                                </span>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <Diagnostic
                                    label="Resolution Latency"
                                    value={
                                        latency
                                            ? formatWait(latency.averageMinutes)
                                            : "—"
                                    }
                                    meta={
                                        latency
                                            ? `across ${latency.sampled} resolved ${
                                                  latency.sampled === 1 ? "hold" : "holds"
                                              }`
                                            : "no hold resolved yet"
                                    }
                                />

                                <Diagnostic
                                    label="Auto-Clearance Rate"
                                    value={pct(data.approved, data.total)}
                                    meta="decided without a human"
                                />

                                <Diagnostic
                                    label="Manual Escalation"
                                    value={pct(data.hold + data.denied, data.total)}
                                    meta="held for authority or blocked"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-6">
                    <div className="border-b border-[#E2E8F0] pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0F172A]">
                                Request Activity Over Time
                            </span>

                            <span className="font-mono text-[10px] text-[#64748B]">
                                {activity.start && activity.end
                                    ? `${activity.start} — ${activity.end}`
                                    : "—"}
                            </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-4 font-mono text-[10px]">
                            <div className="flex flex-wrap gap-5">
                                <LegendItem color="#0D9488" label="Approved" />
                                <LegendItem color="#D97706" label="On Hold" />
                                <LegendItem color="#DC2626" label="Denied" />
                            </div>

                            <div className="flex shrink-0 items-center gap-1 rounded border border-[#E2E8F0] bg-white p-1 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setChartZoom((value) =>
                                            Math.max(0.8, Number((value - 0.2).toFixed(1)))
                                        );
                                        setChartPan(0);
                                    }}
                                    disabled={chartZoom <= 0.8}
                                    aria-label="Zoom out"
                                    className="flex h-7 w-7 items-center justify-center rounded text-base font-semibold text-[#64748B] transition hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    −
                                </button>

                                <span className="min-w-12 text-center font-mono text-[10px] text-[#64748B]">
                                    {Math.round(chartZoom * 100)}%
                                </span>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setChartZoom((value) =>
                                            Math.min(1.8, Number((value + 0.2).toFixed(1)))
                                        )
                                    }
                                    disabled={chartZoom >= 1.8}
                                    aria-label="Zoom in"
                                    className="flex h-7 w-7 items-center justify-center rounded text-base font-semibold text-[#64748B] transition hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    <div
                        className="relative mt-4 h-64 cursor-grab overflow-hidden rounded border border-[#F1F5F9] active:cursor-grabbing"
                        onPointerDown={(event) => {
                            dragStart.current = event.clientX;
                            panStart.current = chartPan;
                            event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                            if (dragStart.current === null) return;
                            setChartPan(panStart.current + event.clientX - dragStart.current);
                        }}
                        onPointerUp={() => {
                            dragStart.current = null;
                        }}
                        onPointerCancel={() => {
                            dragStart.current = null;
                        }}
                    >
                        {activity.available === 0 ? (
                            <div
                                role="status"
                                className="flex h-full items-center justify-center px-4 text-center text-sm text-[#64748B]"
                            >
                                {loading
                                    ? "Loading the decision log…"
                                    : "No decisions recorded for the selected period."}
                            </div>
                        ) : (
                        <div
                            className="h-full w-full origin-center transition-transform duration-200"
                            style={{ transform: `translateX(${chartPan}px) scale(${chartZoom})` }}
                        >
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={activity.points}>
                                <CartesianGrid
                                    stroke="#E2E8F0"
                                    strokeDasharray="3 3"
                                    vertical={false}
                                />

                                <XAxis
                                    dataKey="day"
                                    tick={{ fontSize: 10, fill: "#94A3B8" }}
                                    tickLine={false}
                                    axisLine={{ stroke: "#CBD5E1" }}
                                    interval="preserveStartEnd"
                                    minTickGap={12}
                                />

                                <YAxis hide />

                                <Tooltip
                                    contentStyle={{
                                        border: "1px solid #E2E8F0",
                                        borderRadius: "6px",
                                        fontSize: "11px",
                                    }}
                                />

                                <Line
                                    dataKey="approved"
                                    stroke="#0D9488"
                                    strokeWidth={2.5}
                                    dot={activity.points.length <= 14 ? { r: 3, fill: "#0D9488" } : false}
                                    isAnimationActive={false}
                                />

                                <Line
                                    dataKey="hold"
                                    stroke="#D97706"
                                    strokeWidth={1.5}
                                    strokeDasharray="5 4"
                                    dot={false}
                                    isAnimationActive={false}
                                />

                                <Line
                                    dataKey="denied"
                                    stroke="#DC2626"
                                    strokeWidth={1.5}
                                    strokeDasharray="2 4"
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                        </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3 font-mono text-[10px] text-[#64748B]">
                        <span>WINDOW: {activity.points.length} BUCKETS</span>
                        <span>LATENCY: NOMINAL</span>
                    </div>
                </div>

                <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                        <div className="flex items-center gap-2">
                            <Building2 size={17} className="text-[#64748B]" />

                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0F172A]">
                                Requests by Location / Zone
                            </span>
                        </div>

                        <span className="font-mono text-[10px] text-[#64748B]">
                            ACTIVE SECTORS: {zones.length}
                        </span>
                    </div>

                    <div className="my-6 space-y-5">
                        {data.zoneTotals.map((item) => {
                            const share = pct(item.value, data.zoneSum);
                            const isSelected = location === item.zone;

                            return (
                                <div
                                    key={item.zone}
                                    className={isSelected ? "" : location === "All Locations" ? "" : "opacity-45"}
                                >
                                    <div className="mb-1 flex flex-wrap justify-between gap-2 font-mono text-[10px] text-[#0F172A]">
                                        <span className="font-medium">{item.label}</span>

                                        <span className="tabular-nums">
                                            <strong>{nf.format(item.value)}</strong> req{" "}
                                            <span className="text-[#64748B]">({share})</span>
                                        </span>
                                    </div>

                                    <div className="h-3 w-full overflow-hidden bg-[#F1F5F9]">
                                        <div
                                            className="h-full transition-[width] duration-300"
                                            style={{
                                                width: share,
                                                backgroundColor: item.color,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3 font-mono text-[10px] text-[#64748B]">
                        <span>PRIMARY LOAD: {peakZone?.label ?? "—"}</span>
                        <span>AGGREGATE: {nf.format(data.zoneSum)} UNITS</span>
                    </div>
                </div>
            </section>

            <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={18} className="text-[#64748B]" />

                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0F172A]">
                            Security Events & Irregularities
                        </span>
                    </div>

                    <span className="font-mono text-[10px] text-[#64748B]">
                        FLAGGED_EXCEPTIONS // {timeFilter.toUpperCase()}
                    </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {data.flagCounts.map((flag) => (
                        <SecurityCard
                            key={flag.flag}
                            title={flag.title}
                            value={String(flag.value)}
                            description={flag.description}
                            critical={flag.flag === "LOCATION" && flag.value > 0}
                            icon={
                                flag.flag === "PERMISSION" ||
                                flag.flag === "WINDOW" ? (
                                    <History size={18} />
                                ) : (
                                    <Smartphone size={18} />
                                )
                            }
                        />
                    ))}
                </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0F172A]">
                        Recent Denied & Hold Incidents
                    </span>

                    <div
                        role="group"
                        aria-label="Filter incidents by decision"
                        className="flex flex-wrap gap-1 rounded border border-[#E2E8F0] bg-white p-1"
                    >
                        {(
                            [
                                ["ALL", `All (${data.incidents.length})`],
                                ["DENIED", `Denied (${deniedCount})`],
                                ["HOLD", `On Hold (${holdCount})`],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={outcome === key}
                                onClick={() => changeOutcome(key)}
                                className={`rounded px-3 py-1.5 font-mono text-[10px] font-semibold uppercase transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] ${outcome === key
                                    ? "bg-[#0F172A] text-white"
                                    : "text-[#64748B] hover:bg-[#F1F5F9]"
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]">
                                {[
                                    "Request ID",
                                    "Employee / Operator",
                                    "Cargo / Resource",
                                    "Location",
                                    "Reason & Flag Code",
                                    "Decision",
                                    "Time",
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-[#64748B]"
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-[#E2E8F0]">
                            {visibleIncidents.map((incident) => (
                                <tr
                                    key={incident.id}
                                    className="transition hover:bg-[#0D9488]/5"
                                >
                                    <td className="px-4 py-3 font-mono text-xs font-medium">
                                        {incident.id}
                                    </td>

                                    <td className="px-4 py-3 text-sm">
                                        {incident.employee}
                                    </td>

                                    <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                                        {incident.resource}
                                    </td>

                                    <td className="px-4 py-3 text-xs">
                                        {incident.zone}
                                    </td>

                                    <td className="px-4 py-3 text-xs text-[#64748B]">
                                        {incident.reason}
                                    </td>

                                    <td className="px-4 py-3">
                                        <IncidentBadge decision={incident.decision} />
                                    </td>

                                    <td className="px-4 py-3 text-right font-mono text-xs text-[#64748B]">
                                        {incident.time}
                                    </td>
                                </tr>
                            ))}

                            {visibleIncidents.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-4 py-10 text-center text-xs text-[#64748B]"
                                    >
                                        {outcome === "ALL"
                                            ? "No non-approved incidents"
                                            : outcome === "DENIED"
                                                ? "No denied incidents"
                                                : "No incidents on hold"}{" "}
                                        recorded for {timeFilter} at {location}.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                    <span className="font-mono text-[10px] text-[#64748B]">
                        Showing {visibleIncidents.length} of {filteredIncidents.length} filtered
                        incidents
                    </span>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.max(0, current - 1))}
                            disabled={safePage === 0}
                            className="rounded border border-[#E2E8F0] bg-white px-3 py-1 font-mono text-[10px] text-[#64748B] transition hover:border-[#0D9488] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E2E8F0]"
                        >
                            PREV
                        </button>

                        <span className="font-mono text-[10px] tabular-nums">
                            {safePage + 1} / {pageCount}
                        </span>

                        <button
                            type="button"
                            onClick={() =>
                                setPage((current) => Math.min(pageCount - 1, current + 1))
                            }
                            disabled={safePage >= pageCount - 1}
                            className="rounded border border-[#E2E8F0] bg-white px-3 py-1 font-mono text-[10px] text-[#64748B] transition hover:border-[#0D9488] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E2E8F0]"
                        >
                            NEXT
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}

function SummaryCard({
    label,
    value,
    meta,
    status,
    icon,
}: {
    label: string;
    value: string;
    meta: string;
    status?: string;
    icon?: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                    {label}
                </span>

                {status ? <IncidentBadge decision={status} /> : icon}
            </div>

            <div className="mt-4">
                <p className="text-2xl font-semibold tabular-nums text-[#0F172A]">
                    {value}
                </p>

                <p className="mt-1 font-mono text-[10px] text-[#64748B]">
                    {meta}
                </p>
            </div>
        </div>
    );
}

function DecisionCard({
    label,
    value,
    meta,
    color,
}: {
    label: string;
    value: string;
    meta: string;
    color: string;
}) {
    return (
        <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <div className="flex items-center gap-2">
                <span
                    className="h-2.5 w-2.5"
                    style={{ backgroundColor: color }}
                />

                <span className="text-[10px] font-semibold uppercase text-[#64748B]">
                    {label}
                </span>
            </div>

            <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>

            <p className="mt-1 font-mono text-[10px] text-[#64748B]">
                {meta}
            </p>
        </div>
    );
}

function Diagnostic({
    label,
    value,
    meta,
}: {
    label: string;
    value: string;
    meta: string;
}) {
    return (
        <div>
            <span className="block text-[10px] font-semibold uppercase text-[#64748B]">
                {label}
            </span>

            <span className="font-mono text-xs font-semibold tabular-nums text-[#0F172A]">
                {value}
            </span>

            <span className="mt-1 block font-mono text-[10px] text-[#64748B]">
                {meta}
            </span>
        </div>
    );
}

function LegendItem({
    color,
    label,
}: {
    color: string;
    label: string;
}) {
    return (
        <span className="flex items-center gap-1.5">
            <span
                className="h-0.5 w-4"
                style={{ backgroundColor: color }}
            />
            {label}
        </span>
    );
}

function SecurityCard({
    title,
    value,
    description,
    icon,
    critical,
}: {
    title: string;
    value: string;
    description: string;
    icon?: React.ReactNode;
    critical?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-white p-4">
            <div>
                <p className="text-[10px] font-semibold uppercase text-[#64748B]">
                    {title}
                </p>

                <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>

                <p className="mt-1 font-mono text-[10px] text-[#64748B]">
                    {description}
                </p>
            </div>

            {critical ? (
                <span className="shrink-0 rounded border border-[#FECACA] bg-[#FEF2F2] px-2 py-1 text-[9px] font-semibold text-[#DC2626]">
                    CRITICAL
                </span>
            ) : (
                <span className="shrink-0 text-[#64748B]">
                    {icon}
                </span>
            )}
        </div>
    );
}

function IncidentBadge({
    decision,
}: {
    decision: string;
}) {
    const isDenied = decision === "DENIED";
    const isHold =
        decision === "HOLD" || decision === "ON HOLD";

    const dot = isDenied
        ? "#DC2626"
        : isHold
            ? "#D97706"
            : "#0D9488";

    return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[9px] font-semibold uppercase text-[#0F172A]">
            <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: dot }}
            />

            {decision}
        </span>
    );
}
