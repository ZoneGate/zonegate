"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";

import Link from "next/link";

import ExportAuditLog from "@/components/ExportAuditLog";
import HoldMetricCard from "@/components/HoldMetricCard";
import {
  ApiError,
  getHealth,
  listActors,
  listDecisionContexts,
  type DecisionContext,
  type HealthReport,
  type RosterEntry,
} from "@/lib/api";
import {
  badgeLabel,
  clearedResources,
  countByOutcome,
  decidedToday,
  effectiveOutcome,
  isAwaitingAuthority,
  securityEvents,
  shortTime,
  zoneTotals,
} from "@/lib/derive";

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "APPROVED"
      ? "border-[#CCFBF1] bg-[#F0FDFA] text-[#0F766E]"
      : status === "HOLD"
        ? "border-[#FEF3C7] bg-[#FFFBEB] text-[#B45309]"
        : "border-[#FEE2E2] bg-[#FEF2F2] text-[#B91C1C]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] ${style}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "APPROVED"
            ? "bg-[#0D9488]"
            : status === "HOLD"
              ? "bg-[#D97706]"
              : "bg-[#DC2626]"
        }`}
      />
      {status}
    </span>
  );
}

/** Turns `zova_persistence` into `Zova Persistence` for the health list. */
function humanizeDependency(name: string): string {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function Home() {
  const [contexts, setContexts] = useState<DecisionContext[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () =>
      Promise.all([
        listDecisionContexts({ limit: 100 }),
        listActors(),
        getHealth(),
      ])
        .then(([loadedContexts, loadedRoster, loadedHealth]) => {
          if (cancelled) return;

          setContexts(loadedContexts);
          setRoster(loadedRoster);
          setHealth(loadedHealth);
          setError(null);
        })
        .catch((caught) => {
          if (cancelled) return;

          setHealth(null);
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Unexpected error loading gate telemetry"
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    load();
    const id = window.setInterval(load, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const view = useMemo(() => {
    const counts = countByOutcome(contexts);
    const today = decidedToday(contexts);
    const todayCounts = countByOutcome(today);
    const awaiting = contexts.filter((context) =>
      isAwaitingAuthority(context.decision)
    );

    return {
      counts,
      todayApproved: todayCounts.APPROVE,
      clearanceRate:
        today.length > 0
          ? `${((todayCounts.APPROVE / today.length) * 100).toFixed(1)}% clearance rate`
          : "no decisions today",
      zones: zoneTotals(contexts),
      awaiting,
      cleared: clearedResources(contexts),
      boundDevices: roster.filter((entry) => entry.binding?.is_active).length,
      events: securityEvents(contexts),
    };
  }, [contexts, roster]);

  // The table and the CSV export read the same projected rows.
  const rows = useMemo(
    () =>
      contexts.slice(0, 12).map((context) => ({
        id: context.decision.decision_id,
        resource: context.transaction?.resource_id ?? "—",
        zone: context.transaction?.zone ?? "—",
        officer:
          context.decision.resolution?.resolved_by ??
          context.transaction?.actor_id ??
          "—",
        status: badgeLabel(effectiveOutcome(context.decision)),
        time: shortTime(context.decision.decided_at),
      })),
    [contexts]
  );

  const pending = loading && !contexts.length;

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-[#64748B]">
              Command Protocol // Berth-04
            </span>

            <span className="h-1.5 w-1.5 rounded-full bg-[#0D9488]" />

            <span className="font-mono text-[11px] uppercase text-[#64748B]">
              Encryption: SHA-256 Sync
            </span>
          </div>

          <h1 className="text-2xl font-semibold uppercase tracking-tight text-[#0F172A]">
            Security Operations &amp; Gate Control
          </h1>

          <p className="mt-1 text-sm text-[#64748B]">
            Live checkpoint telemetry, gate clearances, and active perimeter
            throughput.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-white px-3 py-2">
            <RefreshCw size={15} className="text-[#0D9488]" />
            <span className="font-mono text-[11px]">
              TELEMETRY REFRESH: 15s
            </span>
          </div>

          <ExportAuditLog rows={rows} />
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

          <p className="mt-1 font-mono text-[11px] text-[#DC2626]">{error}</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Decisions on Record"
          value={pending ? "—" : String(contexts.length)}
          meta={`${view.awaiting.length} awaiting a human`}
          icon={<Activity size={18} />}
        />

        <MetricCard
          label="Approved Today"
          value={pending ? "—" : String(view.todayApproved)}
          meta={view.clearanceRate}
          icon={<CheckCircle2 size={18} />}
        />

        <Link
          href="/holds"
          className="rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
        >
          <HoldMetricCard />
        </Link>

        <MetricCard
          label="Denied"
          value={pending ? "—" : String(view.counts.DENY)}
          meta="Blocked by deterministic policy"
          icon={<XCircle size={18} />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TelemetryTile
          icon={<MapPin size={16} />}
          label="Busiest Zone"
          value={view.zones[0]?.zone ?? "—"}
        />

        <TelemetryTile
          icon={<Truck size={16} />}
          label="Cargo in Handoff"
          value={pending ? "—" : String(view.awaiting.length).padStart(2, "0")}
        />

        <TelemetryTile
          icon={<ShieldCheck size={16} />}
          label="Bound Devices"
          value={pending ? "—" : String(view.boundDevices).padStart(2, "0")}
        />

        <TelemetryTile
          icon={<Package size={16} />}
          label="Containers Cleared"
          value={pending ? "—" : String(view.cleared.length).padStart(2, "0")}
        />
      </section>

      <section className="flex flex-col">
        <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] px-4 py-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
                Live Requests
              </p>

              <p className="mt-0.5 text-xs text-[#94A3B8]">
                Current authorization activity
              </p>
            </div>

            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#0D9488]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1FD1A8]" />
              LIVE FEED
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#F8FAFC]">
                <tr className="border-b border-[#E2E8F0]">
                  {[
                    "Decision ID",
                    "Resource",
                    "Zone",
                    "Requested By",
                    "Time",
                    "Decision",
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
                {rows.map((request) => (
                  <tr
                    key={request.id}
                    className="border-b border-[#F1F5F9] last:border-b-0 hover:bg-[#F8FAFC]"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {request.id}
                    </td>

                    <td className="px-4 py-3 font-mono text-xs">
                      {request.resource}
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                      {request.zone}
                    </td>

                    <td className="px-4 py-3 text-xs">{request.officer}</td>

                    <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">
                      {request.time}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={request.status} />
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-16 text-center text-sm text-[#64748B]"
                    >
                      {loading
                        ? "Loading gate telemetry…"
                        : "No authorization requests on record yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4">
        <div className="rounded-lg border border-[#E2E8F0] bg-white xl:col-span-2">
          <div className="border-b border-[#F1F5F9] px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
              Recent Security Activity
            </p>
          </div>

          <div className="divide-y divide-[#F1F5F9]">
            {view.events.map((context) => {
              const decision = context.decision;
              const outcome = effectiveOutcome(decision);
              const zone = context.transaction?.zone ?? "unknown zone";
              const awaiting = isAwaitingAuthority(decision);

              return (
                <ActivityRow
                  key={decision.decision_id}
                  icon={
                    outcome === "DENY" ? (
                      <AlertTriangle size={16} />
                    ) : awaiting ? (
                      <Clock3 size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )
                  }
                  title={decision.reasons[0] ?? badgeLabel(outcome)}
                  meta={`${decision.decision_id} · ${zone}`}
                  tone={
                    outcome === "DENY"
                      ? "danger"
                      : awaiting
                        ? "warning"
                        : "success"
                  }
                />
              );
            })}

            {!view.events.length && (
              <p className="px-4 py-8 text-center text-xs text-[#94A3B8]">
                {loading
                  ? "Loading activity…"
                  : "Nothing has been held or blocked."}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
              System Health
            </p>
          </div>

          <div className="space-y-4 p-4">
            <HealthRow
              label="Authorization API"
              value={health ? health.status.toUpperCase() : "UNREACHABLE"}
              ok={Boolean(health)}
            />

            {Object.entries(health?.dependencies ?? {}).map(([name, state]) => (
              <HealthRow
                key={name}
                label={humanizeDependency(name)}
                value={state.toUpperCase()}
                ok={state === "connected" || state === "configured"}
              />
            ))}

            {!health && (
              <p className="font-mono text-[10px] leading-relaxed text-[#94A3B8]">
                Dependency states are reported by the backend. None are assumed
                while it is unreachable.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
function MetricCard({
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
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
          {label}
        </p>

        <span className="text-[#0D9488]">{icon}</span>
      </div>

      <p className="font-mono text-2xl font-semibold text-[#0F172A]">
        {value}
      </p>

      <p className="mt-1 text-xs text-[#94A3B8]">{meta}</p>
    </div>
  );
}

function TelemetryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      <div className="flex items-center gap-2 text-[#64748B]">
        <span className="text-[#0D9488]">{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>

      <p className="mt-3 font-mono text-lg font-semibold text-[#0F172A]">
        {value}
      </p>
    </div>
  );
}

function ActivityRow({
  icon,
  title,
  meta,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  tone: "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-[#0D9488]"
      : tone === "warning"
        ? "text-[#D97706]"
        : "text-[#DC2626]";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={toneClass}>{icon}</span>

      <div>
        <p className="text-xs font-medium text-[#0F172A]">{title}</p>
        <p className="mt-0.5 font-mono text-[10px] text-[#94A3B8]">
          {meta}
        </p>
      </div>
    </div>
  );
}

function HealthRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#64748B]">{label}</span>

      <span
        className={`flex items-center gap-1.5 font-mono text-[10px] ${
          ok ? "text-[#0D9488]" : "text-[#DC2626]"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            ok ? "bg-[#1FD1A8]" : "bg-[#DC2626]"
          }`}
        />
        {value}
      </span>
    </div>
  );
}
