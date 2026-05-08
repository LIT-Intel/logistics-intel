"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Sparkles, Building2, MapPin, Globe2, ArrowRight, Star } from "lucide-react";
import { CountUp } from "./CountUp";

/**
 * Company Intelligence Mock — stylized recreation of the in-app
 * profile screen for marketing use. Generic shipper "Acme Industries"
 * — never references real customers.
 *
 * On scroll-into-view: KPIs count up, FCL/LCL bars fill, "What Matters
 * Now" cyan banner pulses in, top-lane bars stagger up. Pure HTML +
 * Tailwind + framer-motion. No images. Looks like the real product.
 */
export function CompanyIntelMock({ className = "" }: { className?: string }) {
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
          app.logisticintel.com / company / acme-industries
        </span>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        {/* Main column */}
        <div className="min-w-0">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-[16px] font-bold text-white"
              style={{ background: "linear-gradient(160deg,#3b82f6,#2563eb)" }}
            >
              AI
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-display truncate text-[20px] font-semibold tracking-[-0.015em] text-ink-900">
                  Acme Industries
                </h3>
                <Star className="h-3.5 w-3.5 text-ink-200" />
                <span
                  className="font-mono inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold"
                  style={{
                    color: "#10b981",
                    background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.25)",
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  In CRM
                </span>
              </div>
              <div className="font-body mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
                <span className="font-mono">
                  Trailing 12m · <span className="font-bold text-ink-900">7,862</span> shipments ·{" "}
                  <span className="font-bold text-ink-900">18.9K TEU</span>
                </span>
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" /> Fremont, CA
                </span>
                <span className="inline-flex items-center gap-1 truncate">
                  <Globe2 className="h-3 w-3 shrink-0" /> acmeindustries.com
                </span>
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-ink-100 bg-ink-25 p-3 sm:grid-cols-6">
            <Kpi label="Shipments 12m" value="7,862" toNumber={7862} format={(n) => Math.round(n).toLocaleString()} start={inView} />
            <Kpi label="TEU 12m" value="18.9K" toNumber={18900} format={formatK} start={inView} />
            <Kpi label="Spend (all)" value="$23.4M" toNumber={23.4} format={(n) => `$${n.toFixed(1)}M`} start={inView} />
            <Kpi label="Total ship" value="50,106" toNumber={50106} format={(n) => Math.round(n).toLocaleString()} start={inView} />
            <Kpi label="Trade lanes" value="10" toNumber={10} format={(n) => Math.round(n).toString()} start={inView} />
            <Kpi label="Top lane" value="TR→US" toNumber={49} format={(n) => `${Math.round(n)}%`} start={inView} suffix="49% TR→US" raw />
          </div>

          {/* What Matters Now banner */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
            className="relative mt-4 overflow-hidden rounded-xl border border-white/10 px-5 py-4 text-white"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full opacity-50"
              style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
            />
            <div
              className="font-display relative flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "#00F0FF" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              What Matters Now
              <span className="font-mono ml-auto text-[9.5px] font-medium tracking-wider text-ink-200">
                Trailing 12m
              </span>
            </div>
            <div className="font-display relative mt-1 text-[15px] font-semibold leading-tight tracking-[-0.01em] sm:text-[16px]">
              Turkey → United States carries 49% of trailing-12m volume.
            </div>
            <div className="font-body relative mt-1 text-[11.5px] leading-snug text-ink-150 sm:text-[12px]">
              <span className="font-bold text-white">7 active lanes</span> across this account · most recent
              shipment 23 days ago
            </div>
          </motion.div>

          {/* Two-column data grid */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Top trade lanes */}
            <Card title="Top trade lanes" subtitle="Globe + ranked share">
              <ul className="space-y-2">
                {[
                  { rank: "01", flag: "🇹🇷", lane: "Çiğli, Turkey", tail: "22 ship · 30 TEU", pct: 0.49 },
                  { rank: "02", flag: "🇨🇳", lane: "Qing'an, China", tail: "8 ship · 12 TEU", pct: 0.18 },
                  { rank: "03", flag: "🇪🇸", lane: "Pol, Spain", tail: "7 ship · 11 TEU", pct: 0.16 },
                  { rank: "04", flag: "🇰🇷", lane: "Manteca, S.Korea", tail: "3 ship · 5 TEU", pct: 0.07 },
                  { rank: "05", flag: "🇩🇪", lane: "Neuwied, Germany", tail: "2 ship · 3 TEU", pct: 0.04 },
                ].map((r, i) => (
                  <li key={r.rank} className="flex items-center gap-2.5">
                    <span className="font-mono w-5 shrink-0 text-[10px] text-ink-200">{r.rank}</span>
                    <span className="text-[14px]">{r.flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-display truncate text-[12px] font-semibold text-ink-900">
                        {r.lane}
                      </div>
                      <div className="font-mono truncate text-[10px] text-ink-200">{r.tail}</div>
                    </div>
                    <div className="relative h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-ink-50">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={inView ? { width: `${r.pct * 100}%` } : {}}
                        transition={{ delay: 0.6 + i * 0.08, duration: 0.6, ease: "easeOut" }}
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: "linear-gradient(90deg,#3b82f6,#2563eb)" }}
                      />
                    </div>
                    <span className="font-mono w-9 shrink-0 text-right text-[10.5px] font-semibold text-brand-blue-700">
                      {Math.round(r.pct * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* FCL / LCL split */}
            <Card title="Imports by mode" subtitle="Modal split · trailing 12m">
              <BarRow label="FCL" pct={0.94} count="47,136" tone="blue" inView={inView} delay={0.7} />
              <BarRow label="LCL" pct={0.06} count="2,970" tone="cyan" inView={inView} delay={0.8} />
              <div className="mt-4">
                <div className="font-display mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-200">
                  Monthly cadence
                </div>
                <div className="flex h-14 items-end gap-1.5">
                  {[0.6, 0.85, 0.7, 0.5].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={inView ? { height: `${h * 100}%` } : {}}
                      transition={{ delay: 0.9 + i * 0.06, duration: 0.45, ease: "easeOut" }}
                      className="flex-1 rounded-t"
                      style={{ background: "linear-gradient(180deg,#60a5fa,#2563eb)" }}
                    />
                  ))}
                </div>
                <div className="font-mono mt-1 flex justify-between text-[9px] text-ink-200">
                  <span>Dec</span>
                  <span>Jan</span>
                  <span>Feb</span>
                  <span>Mar</span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden flex-col gap-3 lg:flex">
          <SidebarCard title="Account details">
            <SidebarRow label="Owner" value="Gabriel K." />
            <SidebarRow label="Last activity" value="23 days ago" />
            <SidebarRow label="CRM stage" value="Active" tone="emerald" />
          </SidebarCard>

          <SidebarCard title="Trade intelligence">
            <SidebarRow label="Top lane" value="TR → US" />
            <SidebarRow label="Top carrier" value="Hapag-Lloyd" />
            <SidebarRow label="Top mode" value="FCL 94%" />
            <SidebarRow label="Top HS" value="87 Auto" />
          </SidebarCard>

          <button
            className="font-display inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-semibold text-white shadow-sm"
            style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
          >
            Start Outreach <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  toNumber,
  format,
  start,
  suffix,
  raw,
}: {
  label: string;
  value: string;
  toNumber: number;
  format: (n: number) => string;
  start: boolean;
  suffix?: string;
  raw?: boolean;
}) {
  return (
    <div>
      <div className="font-display text-[9px] font-bold uppercase tracking-wider text-ink-200">
        {label}
      </div>
      <div className="font-mono mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-brand-blue-700 sm:text-[16px]">
        {raw ? value : <CountUp to={toNumber} format={format} start={start} duration={1400} />}
      </div>
      {suffix && <div className="font-body text-[9px] text-ink-200">{suffix}</div>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="font-display text-[12px] font-semibold tracking-[-0.005em] text-ink-900">
          {title}
        </div>
        {subtitle && (
          <div className="font-body text-[10px] text-ink-500">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function BarRow({
  label,
  pct,
  count,
  tone,
  inView,
  delay,
}: {
  label: string;
  pct: number;
  count: string;
  tone: "blue" | "cyan";
  inView: boolean;
  delay: number;
}) {
  const grad =
    tone === "blue"
      ? "linear-gradient(90deg,#3b82f6,#2563eb)"
      : "linear-gradient(90deg,#22d3ee,#0891b2)";
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="font-display mb-1 flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-ink-900">{label}</span>
        <span className="font-mono text-[11px] text-ink-500">
          {count} ·{" "}
          <span className="font-semibold" style={{ color: tone === "blue" ? "#2563eb" : "#0891b2" }}>
            {Math.round(pct * 100)}%
          </span>
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-ink-50">
        <motion.div
          initial={{ width: 0 }}
          animate={inView ? { width: `${pct * 100}%` } : {}}
          transition={{ delay, duration: 0.7, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: grad }}
        />
      </div>
    </div>
  );
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-sm">
      <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-200">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SidebarRow({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-body text-[10.5px] text-ink-500">{label}</span>
      <span
        className={`font-display truncate text-[11px] font-semibold ${
          tone === "emerald" ? "text-emerald-600" : "text-ink-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Math.round(n).toString();
}
