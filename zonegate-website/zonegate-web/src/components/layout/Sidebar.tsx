"use client";

import Link from "next/link";
import Image from "next/image";

// Imported rather than referenced as "/zonegate-shield.png": with images
// unoptimized, next/image does not add the base path to a string src, so the
// GitHub Pages demo (served under /zonegate-website) asked for the logo at the
// site root and got a 404. An import is emitted with the base path applied.
import shield from "@/assets/zonegate-shield.png";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Grid2X2,
  ClipboardList,
  BadgeCheck,
  BarChart3,
  SlidersHorizontal,
  ChevronDown,
  Clock,
  LogOut,
  User,
  X,
} from "lucide-react";

import { listDecisions } from "@/lib/api";
import { useSession } from "@/components/layout/SessionGate";

const menuItems = [
  { label: "Dashboard", href: "/", icon: Grid2X2 },
  { label: "Requests", href: "/requests", icon: ClipboardList },
  { label: "Hold Queue", href: "/holds", icon: Clock, live: true },
  { label: "Employees", href: "/employees", icon: BadgeCheck },
  { label: "Statistics", href: "/statistics", icon: BarChart3 },
];

const settingsSections = [
  { label: "General", hash: "#general" },
  { label: "Locations & Zones", hash: "#zones" },
  { label: "Authorization Policies", hash: "#policies" },
  { label: "Security", hash: "#security" },
  { label: "Notifications", hash: "#notifications" },
];

export default function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { actor, signOut } = useSession();
  const onSettings = pathname.startsWith("/settings");

  // Open on the settings page itself, opened by the link, folded by the chevron.
  const [expanded, setExpanded] = useState(onSettings);

  // Badge for the hold queue, refreshed while the operator has the app open.
  const [pendingHolds, setPendingHolds] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      listDecisions({ decision: "HOLD", pending: true, limit: 200 })
        .then((holds) => {
          if (!cancelled) setPendingHolds(holds.length);
        })
        .catch(() => {
          if (!cancelled) setPendingHolds(null);
        });
    };

    poll();
    const id = window.setInterval(poll, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pathname]);

  return (
    <>
      <svg aria-hidden="true" width="0" height="0" className="absolute pointer-events-none">
        <defs>
          <filter id="zonegate-remove-white" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 -3 -3 0 6"
              result="logo-mask"
            />
            <feFlood floodColor="#155566" result="brand-color" />
            <feComposite in="brand-color" in2="logo-mask" operator="in" result="logo" />
            <feComposite in="logo" in2="SourceAlpha" operator="in" />
          </filter>
        </defs>
      </svg>
      {/* Backdrop, mobile only */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-[#0F172A]/60 transition-opacity lg:hidden ${open
          ? "opacity-100"
          : "pointer-events-none opacity-0"
          }`}
      />

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col justify-between border-r border-[#1E293B] bg-[#0F172A] text-white transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative border-b border-[#1E293B] p-4">
            <Link
              href="/"
              aria-label="ZoneGate home"
              onClick={onClose}
              className="flex items-center justify-center py-2 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1FD1A8]"
            >
              {/* Shield artwork plus live text, the same pairing the sign-in
                  screen uses, so the wordmark's letterforms are drawn by the
                  font rather than baked into the image. */}
              <span className="flex flex-col items-center gap-2 py-1">
                <Image
                  src={shield}
                  alt=""
                  width={500}
                  height={500}
                  sizes="72px"
                  priority
                  className="h-auto w-[72px]"
                  style={{ filter: "url(#zonegate-remove-white)" }}
                />

                <span className="text-xl font-bold leading-none tracking-tight text-[#155566]">
                  ZoneGate
                </span>
              </span>
            </Link>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#1E293B] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FD1A8] lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="flex flex-col gap-1 p-3">
            {menuItems.map((item) => {
              const Icon = item.icon;

              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FD1A8] ${isActive
                    ? "border border-[#0D9488]/40 bg-[#0D9488]/20 text-white"
                    : "text-[#94A3B8] hover:bg-[#1E293B] hover:text-white"
                    }`}
                >
                  <Icon
                    size={18}
                    className={isActive ? "text-[#1FD1A8]" : ""}
                  />
                  {item.label}

                  {item.live && pendingHolds !== null && pendingHolds > 0 && (
                    <span className="ml-auto rounded-full bg-[#D97706] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                      {pendingHolds}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Settings folds open to reveal its sections */}
            <div className="mt-1">
              <div
                className={`flex items-center gap-1 rounded transition-colors ${onSettings
                  ? "border border-[#0D9488]/40 bg-[#0D9488]/20"
                  : "hover:bg-[#1E293B]"
                  }`}
              >
                <Link
                  href="/settings"
                  onClick={() => {
                    setExpanded(true);
                    onClose?.();
                  }}
                  aria-current={onSettings ? "page" : undefined}
                  className={`flex flex-1 items-center gap-3 rounded px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FD1A8] ${onSettings
                    ? "text-white"
                    : "text-[#94A3B8] hover:text-white"
                    }`}
                >
                  <SlidersHorizontal
                    size={18}
                    className={onSettings ? "text-[#1FD1A8]" : ""}
                  />
                  Settings
                </Link>

                <button
                  type="button"
                  onClick={() => setExpanded((current) => !current)}
                  aria-expanded={expanded}
                  aria-controls="settings-sections"
                  aria-label={
                    expanded ? "Collapse settings sections" : "Expand settings sections"
                  }
                  className="mr-1 rounded p-1.5 text-[#94A3B8] transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FD1A8]"
                >
                  <ChevronDown
                    size={15}
                    className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""
                      }`}
                  />
                </button>
              </div>

              <div
                id="settings-sections"
                hidden={!expanded}
                className="mt-1 flex flex-col gap-0.5 border-l border-[#1E293B] pl-3 ml-4"
              >
                {settingsSections.map((section) => (
                  <Link
                    key={section.hash}
                    href={`/settings${section.hash}`}
                    onClick={onClose}
                    className="rounded px-3 py-1.5 text-[13px] text-[#94A3B8] transition-colors hover:bg-[#1E293B] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FD1A8]"
                  >
                    {section.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
        </div>

        <div className="border-t border-[#1E293B] bg-[#090D16] p-4">
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-[#94A3B8]">
              Node Facility
            </p>
            <p className="mt-1 font-mono text-xs text-white">
              TERMINAL 4 - PORT BERTH B
            </p>
          </div>

          <div className="mb-4 flex items-center justify-between rounded border border-[#1E293B] bg-[#0F172A] px-2 py-1.5">
            <span className="text-[10px] uppercase text-[#94A3B8]">
              Feed Status
            </span>

            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#1FD1A8]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1FD1A8]" />
              LIVE
            </span>
          </div>

          <div className="border-t border-[#1E293B] pt-3">
            <Link
              href="/account"
              onClick={onClose}
              aria-current={pathname === "/account" ? "page" : undefined}
              className={`-mx-1 flex items-center gap-3 rounded px-1 py-1 transition hover:bg-[#1E293B] ${pathname === "/account" ? "bg-[#1E293B]" : ""}`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#334155] bg-[#1E293B]">
                <User size={16} className="text-[#1FD1A8]" />
              </div>

              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-white" title={actor.actor_id}>
                  {actor.actor_id}
                </p>
                <p className="truncate text-[10px] text-[#94A3B8]">
                  {actor.role}
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={signOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-[#1E293B] px-2 py-1.5 font-mono text-[10px] uppercase text-[#94A3B8] transition hover:border-[#334155] hover:text-white"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
