"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { QUERY_CHANGE_EVENT } from "@/components/useQueryParam";
import { getHealth, isDemoMode } from "@/lib/api";
import { Clock3, Menu, Search } from "lucide-react";

function formatUtc(date: Date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes()
  ).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")} UTC`;
}

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [demo, setDemo] = useState(false);

  // Rendered empty on the server, then ticked on the client, so the markup matches.
  const [clock, setClock] = useState("");

  // null while the first probe is in flight, so the gate is never claimed
  // healthy before anything has actually answered.
  const [gateOnline, setGateOnline] = useState<boolean | null>(null);

  useEffect(() => {
    setDemo(isDemoMode());
    const tick = () => setClock(formatUtc(new Date()));

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const probe = () =>
      getHealth()
        .then((report) => {
          if (!cancelled) setGateOnline(report.status === "healthy");
        })
        .catch(() => {
          if (!cancelled) setGateOnline(false);
        });

    probe();
    const id = window.setInterval(probe, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) return;

    router.push(`/requests?q=${encodeURIComponent(trimmed)}`);

    // A soft navigation does not fire popstate, so tell the queue directly.
    window.setTimeout(
      () => window.dispatchEvent(new Event(QUERY_CHANGE_EVENT)),
      0
    );
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-4 sm:px-6 lg:left-64">
      <div className="flex min-w-0 items-center gap-4 lg:gap-6">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="-ml-1 rounded p-1.5 text-[#0F172A] transition-colors hover:bg-[#F1F5F9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] lg:hidden"
        >
          <Menu size={20} />
        </button>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
            Facility:
          </span>

          <span className="rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#0F172A]">
            BERTH-04 / SECTOR-B
          </span>

          {demo && (
            <span className="inline-flex items-center gap-1 rounded border border-[#0284C7]/30 bg-[#0284C7]/10 px-2 py-1 font-mono text-[10px] font-semibold text-[#0369A1]">
              DEMO MODE
            </span>
          )}
        </div>

        <div className="hidden items-center gap-2 xl:flex">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#64748B]">
            Gate Status:
          </span>

          <span
            className={
              gateOnline === false
                ? "flex items-center gap-1.5 rounded border border-[#DC2626]/30 bg-[#DC2626]/5 px-2 py-1 font-mono text-[11px] text-[#DC2626]"
                : gateOnline
                  ? "flex items-center gap-1.5 rounded border border-[#0D9488]/30 bg-[#0D9488]/5 px-2 py-1 font-mono text-[11px] text-[#0D9488]"
                  : "flex items-center gap-1.5 rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-[11px] text-[#64748B]"
            }
          >
            <span
              className={
                gateOnline === false
                  ? "h-1.5 w-1.5 rounded-full bg-[#DC2626]"
                  : gateOnline
                    ? "h-1.5 w-1.5 rounded-full bg-[#0D9488]"
                    : "h-1.5 w-1.5 rounded-full bg-[#94A3B8]"
              }
            />
            {gateOnline === false
              ? "UNREACHABLE"
              : gateOnline
                ? "ONLINE [AUTO-INTERLOCK]"
                : "CHECKING…"}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <form onSubmit={submitSearch} className="relative hidden md:block">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748B]"
          />

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search manifests"
            placeholder="SEARCH MANIFEST / ID / TAG..."
            className="w-52 rounded border border-[#E2E8F0] bg-[#F8FAFC] py-1.5 pl-8 pr-3 font-mono text-[11px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0D9488] lg:w-64"
          />
        </form>

        <div className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1.5">
          <Clock3 size={15} className="text-[#64748B]" />
          <span
            suppressHydrationWarning
            className="font-mono text-xs tabular-nums text-[#0F172A]"
          >
            {clock || "--:--:-- UTC"}
          </span>
        </div>

      </div>
    </header>
  );
}
