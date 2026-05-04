"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  Sparkles,
  Search,
  Bell,
  TrendingUp,
  Inbox,
  Building2,
  ArrowRight,
} from "lucide-react";
import { CountUp } from "./CountUp";
import { MarketingGlobe } from "./MarketingGlobe";

/**
 * DashboardMock — animated stylized recreation of the in-app workspace
 * Dashboard. Lives on /products as the hero visual. Mirrors the real
 * app's information architecture (Pulse Coach, workspace lanes globe,
 * What Matters Now, recent enrichments) without copying real customer
 * data.
 *
 * Triggers on scroll-into-view: KPIs count up, lane bars stagger, the
 * Pulse Coach card slides in, the activity table fades in row-by-row.
 */
export function DashboardMock({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)] ${className}`}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-25 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="font-mono ml-3 flex-1 truncate rounded-md border border-ink-100 bg-white px-2.5 py-1 text-[11px] text-ink-500">
          app.logisticintel.com / dashboard
        </span>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[180px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="hidden flex-col gap-1 lg:flex">
          <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-200">
            Workspace
          </div>
          {[
            { icon: Sparkles, label: "Dashboard", active: true },
            { icon: Search, label: "Pulse" },
            { icon: Building2, label: "Companies" },
            { icon: Inbox, label: "Command Center" },
            { icon: TrendingUp, label: "Campaigns" },
            { icon: Bell, label: "Signals" },
          ].map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`font-display flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] ${
                active
                  ? "bg-brand-blue/10 font-semibold text-brand-blue-700"
                  : "text-ink-500 hover:bg-ink-25"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </aside>

        {/* Main content */}
        <div className="min-w-0 space-y-3">
          {/* Workspace header */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div>
              <div className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-ink-200">
                Welcome back
              </div>
              <div className="font-display mt-0.5 text-[18px] font-semibold tracking-[-0.015em] text-ink-900">
                Valesco Raymond
              </div>
            </div>
            <span
              className="font-mono ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                color: "#10b981",
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.25)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live data
            </span>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-2.5">
            <Kpi label="Saved accounts" value={143} format={(n) => Math.round(n).toString()} start={inView} />
            <Kpi label="Verified contacts" value={4} format={(n) => Math.round(n).toString()} start={inView} />
            <Kpi
              label="Shipments 12m"
              value={169800}
              format={(n) => `${(n / 1000).toFixed(1)}K`}
              start={inView}
            />
          </div>

          {/* Lanes + Pulse Coach */}
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            {/* Workspace trade lanes */}
            <div className="rounded-xl border border-ink-100 bg-white p-3">
              <div className="font-display mb-1.5 flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                  Workspace trade lanes
                </span>
                <span className="font-mono text-[9.5px] text-ink-200">By volume</span>
              </div>
              <div className="grid items-center gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
                <div className="hidden sm:block">
                  <MarketingGlobe size={110} />
                </div>
                <ul className="space-y-1.5">
                  {[
                    { rank: "01", flag: "🇲🇦", from: "MA", to: "US", count: "3,990" },
                    { rank: "02", flag: "🇰🇷", from: "Sindang-ri", to: "US", count: "1,231" },
                    { rank: "03", flag: "🇰🇷", from: "KR", to: "Benicia, US", count: "509" },
                    { rank: "04", flag: "🇹🇭", from: "TH", to: "Atlanta, US", count: "356" },
                  ].map((l, i) => (
                    <motion.li
                      key={l.rank}
                      initial={{ opacity: 0, x: -8 }}
                      animate={inView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.2 + i * 0.06, duration: 0.32 }}
                      className="flex items-center gap-1.5"
                    >
                      <span className="font-mono w-5 shrink-0 text-[9.5px] text-ink-200">{l.rank}</span>
                      <span className="text-[12px]">{l.flag}</span>
                      <span className="font-display flex-1 truncate text-[11px] font-semibold text-ink-900">
                        {l.from} → {l.to}
                      </span>
                      <span className="font-mono shrink-0 text-[10.5px] font-semibold text-brand-blue-700">
                        {l.count}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Pulse Coach card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.45, duration: 0.4 }}
              className="relative overflow-hidden rounded-xl border border-white/10 p-3 text-white"
              style={{
                background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full opacity-50"
                style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
              />
              <div
                className="font-display relative flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#00F0FF" }}
              >
                <Sparkles className="h-3 w-3" />
                Pulse Coach
              </div>
              <div className="font-display relative mt-1.5 text-[12.5px] font-semibold leading-snug">
                Focus on Kia Georgia
              </div>
              <p className="font-body relative mt-1 text-[11px] leading-snug text-ink-150">
                Recently saved + active KR→US imports. Open lane pings the team to add to Q2 outreach.
              </p>
              <div className="font-display relative mt-2 inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: "#00F0FF" }}>
                Add to Q2 Outreach <ArrowRight className="h-3 w-3" />
              </div>
            </motion.div>
          </div>

          {/* What Matters Now table */}
          <div className="rounded-xl border border-ink-100 bg-white p-3">
            <div className="font-display mb-1.5 flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                What matters now
              </span>
              <span className="font-mono text-[9.5px] text-ink-200">Most recent activity</span>
            </div>
            <div className="space-y-1">
              {[
                { name: "Benteler Automotive", lane: "DE → US", teu: "228", tint: "#3b82f6", initials: "BA" },
                { name: "Trw Automotive", lane: "ZA → US", teu: "69", tint: "#8b5cf6", initials: "TR" },
                { name: "Fisher Scientific", lane: "DE → US", teu: "53", tint: "#06b6d4", initials: "FS" },
                { name: "Rivian Automotive", lane: "KR → US", teu: "676", tint: "#10b981", initials: "RA" },
              ].map((row, i) => (
                <motion.div
                  key={row.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.55 + i * 0.07, duration: 0.32 }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-ink-25"
                >
                  <span
                    className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9.5px] font-bold text-white"
                    style={{ background: row.tint }}
                  >
                    {row.initials}
                  </span>
                  <span className="font-display flex-1 truncate text-[11.5px] font-semibold text-ink-900">
                    {row.name}
                  </span>
                  <span className="font-mono hidden shrink-0 text-[10px] text-ink-500 sm:inline">
                    {row.lane}
                  </span>
                  <span className="font-mono shrink-0 text-[10.5px] font-semibold text-brand-blue-700">
                    {row.teu} TEU
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  format,
  start,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  start: boolean;
}) {
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-25 px-3 py-2.5">
      <div className="font-display text-[9.5px] font-bold uppercase tracking-wider text-ink-200">
        {label}
      </div>
      <div className="font-mono mt-0.5 text-[18px] font-semibold tracking-[-0.01em] text-ink-900">
        <CountUp to={value} format={format} start={start} duration={1400} />
      </div>
    </div>
  );
}
