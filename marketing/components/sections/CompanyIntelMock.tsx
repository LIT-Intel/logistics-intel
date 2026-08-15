"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, MapPin, Sparkles, Star } from "lucide-react";
import { useRef } from "react";
import { logoDevUrl } from "@/lib/sanityImage";
import { LogoImage } from "./LogoImage";

const company = {
  name: "Home Depot USA",
  domain: "homedepot.com",
  location: "Atlanta, GA",
  shipments: "58,415",
  teu: "114.5K",
  spend: "$175.7M",
  lanes: "22",
  primaryLane: "VN → US",
};

const metrics = [
  { label: "Est. spend 12m", value: company.spend, tone: "text-emerald-600" },
  { label: "Shipments 12m", value: company.shipments, tone: "text-blue-700" },
  { label: "TEU 12m", value: company.teu, tone: "text-cyan-700" },
  { label: "Trade lanes", value: company.lanes, tone: "text-violet-700" },
];

const lanes = [
  { origin: "Vietnam", volume: "18,693", share: 0.32 },
  { origin: "China", volume: "15,806", share: 0.27 },
  { origin: "Thailand", volume: "8,202", share: 0.14 },
];

/** Responsive marketing recreation of the real Company Intelligence profile. */
export function CompanyIntelMock({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-70px" });
  const reduceMotion = useReducedMotion();
  const animate = inView || Boolean(reduceMotion);
  const logo = logoDevUrl(company.domain, { size: 160, format: "png" });

  return (
    <div ref={ref} className={`relative overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-25 px-3 py-2 sm:px-4 sm:py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="font-mono ml-1 min-w-0 flex-1 truncate rounded-md border border-ink-100 bg-white px-2.5 py-1 text-[9px] text-ink-500 sm:ml-3 sm:text-[11px]">app.logisticintel.com / company / home-depot-usa</span>
      </div>

      <div className="p-3 sm:p-5">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={animate ? { opacity: 1, y: 0 } : {}} transition={{ duration: reduceMotion ? 0 : 0.4 }} className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <LogoImage src={logo} domain={company.domain} name={company.name} className="[&>span:last-child]:text-[16px] sm:[&>span:last-child]:text-[20px]" />
            <div className="font-body mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-500 sm:text-[11.5px]">
              <span className="font-mono tabular-nums">Trailing 12m · {company.shipments} shipments · {company.teu} TEU</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {company.location}</span>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <Star className="h-4 w-4 text-ink-200" />
            <span className="font-mono rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">● In CRM</span>
          </div>
        </motion.div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <motion.div key={metric.label} initial={{ opacity: 0, y: 10 }} animate={animate ? { opacity: 1, y: 0 } : {}} transition={{ delay: reduceMotion ? 0 : 0.12 + index * 0.06, duration: reduceMotion ? 0 : 0.38 }} className="min-w-0 rounded-xl border border-ink-100 bg-ink-25 px-3 py-2.5">
              <div className="font-display truncate text-[8px] font-bold uppercase tracking-[0.06em] text-ink-300 sm:text-[9px]">{metric.label}</div>
              <div className={`font-mono mt-1 whitespace-nowrap text-[14px] font-semibold tabular-nums sm:text-[16px] ${metric.tone}`}>{metric.value}</div>
            </motion.div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_190px]">
          <div className="min-w-0 space-y-3">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={animate ? { opacity: 1, y: 0 } : {}} transition={{ delay: reduceMotion ? 0 : 0.35, duration: reduceMotion ? 0 : 0.45 }} className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-4 py-3.5 text-white sm:px-5 sm:py-4">
              <div className="font-display flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-300 sm:text-[10px]"><Sparkles className="h-3.5 w-3.5" /> Buying intent</div>
              <div className="font-display mt-1 text-[13px] font-semibold leading-snug sm:text-[16px]">Vietnam → United States carries 32% of recent import volume.</div>
              <p className="font-body mt-1 text-[10px] leading-relaxed text-slate-300 sm:text-[11.5px]">Volume increased across three active supplier lanes. The account is ready for focused outreach.</p>
            </motion.div>
            <RouteMap animate={animate} reduceMotion={Boolean(reduceMotion)} />
          </div>

          <motion.aside initial={{ opacity: 0, x: 10 }} animate={animate ? { opacity: 1, x: 0 } : {}} transition={{ delay: reduceMotion ? 0 : 0.5, duration: reduceMotion ? 0 : 0.4 }} className="hidden space-y-3 xl:block">
            <SideCard title="Account details"><Row label="CRM stage" value="Prospecting" tone="text-blue-700" /><Row label="Last activity" value="4 days ago" /><Row label="Imports to" value="United States" /></SideCard>
            <SideCard title="Trade intelligence"><Row label="Top lane" value={company.primaryLane} tone="text-blue-700" /><Row label="Top carrier" value="CMDU" /><Row label="Top mode" value="FCL 100%" /></SideCard>
            <button type="button" className="font-display inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-[12px] font-semibold text-white shadow-sm transition hover:bg-blue-700">Start Outreach <ArrowRight className="h-3.5 w-3.5" /></button>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}

function RouteMap({ animate, reduceMotion }: { animate: boolean; reduceMotion: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={animate ? { opacity: 1, y: 0 } : {}} transition={{ delay: reduceMotion ? 0 : 0.48, duration: reduceMotion ? 0 : 0.45 }} className="overflow-hidden rounded-xl border border-ink-100 bg-[#edf8f9]">
      <div className="flex items-center justify-between border-b border-cyan-100 bg-white/80 px-3 py-2.5 sm:px-4">
        <div><div className="font-display text-[11px] font-semibold text-ink-900 sm:text-[12px]">Global trade lanes</div><div className="font-body text-[9px] text-ink-500 sm:text-[10px]">Recent import activity</div></div>
        <span className="font-mono rounded-md bg-blue-50 px-2 py-1 text-[9px] font-semibold text-blue-700">2026 · All modes</span>
      </div>
      <div className="relative h-[128px] overflow-hidden bg-[radial-gradient(circle_at_16%_42%,rgba(34,211,238,.18),transparent_22%),radial-gradient(circle_at_82%_45%,rgba(59,130,246,.16),transparent_24%),linear-gradient(135deg,#effbfb,#eaf2fb)] sm:h-[168px]">
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(14,116,144,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,.12)_1px,transparent_1px)] [background-size:32px_32px]" />
        <span className="font-mono absolute left-[12%] top-[42%] text-[9px] font-semibold text-ink-500 sm:text-[10px]">VIETNAM</span>
        <span className="font-mono absolute right-[9%] top-[39%] text-[9px] font-semibold text-ink-500 sm:text-[10px]">UNITED STATES</span>
        <svg viewBox="0 0 700 180" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <motion.path d="M126 103 C 275 45, 430 52, 588 94" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 8" initial={{ pathLength: 0 }} animate={animate ? { pathLength: 1 } : {}} transition={{ delay: reduceMotion ? 0 : 0.65, duration: reduceMotion ? 0 : 1.1, ease: "easeInOut" }} />
          <circle cx="126" cy="103" r="8" fill="#2563eb" /><circle cx="588" cy="94" r="8" fill="#2563eb" />
        </svg>
        <div className="absolute bottom-2.5 left-3 right-3 rounded-lg border border-white/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur sm:left-4 sm:right-auto sm:w-[280px]">
          <div className="font-display text-[10px] font-semibold text-ink-900 sm:text-[11px]">Vietnam → United States</div>
          <div className="font-mono mt-0.5 text-[9px] tabular-nums text-ink-500">18,693 shipments · 58,037 TEU</div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-ink-100 bg-white">
        {lanes.map((lane, index) => (
          <div key={lane.origin} className="min-w-0 px-2.5 py-2.5 sm:px-3">
            <div className="font-display truncate text-[9px] font-semibold text-ink-900 sm:text-[10px]">{lane.origin}</div>
            <div className="font-mono mt-1 truncate text-[8px] tabular-nums text-ink-500 sm:text-[9px]">{lane.volume} ship</div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-50"><motion.div className="h-full rounded-full bg-blue-600" initial={{ width: 0 }} animate={animate ? { width: `${lane.share * 100}%` } : {}} transition={{ delay: reduceMotion ? 0 : 0.8 + index * 0.08, duration: reduceMotion ? 0 : 0.55 }} /></div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-sm"><div className="font-display mb-2 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-300">{title}</div><div className="space-y-2">{children}</div></div>;
}

function Row({ label, value, tone = "text-ink-900" }: { label: string; value: string; tone?: string }) {
  return <div className="flex items-center justify-between gap-2"><span className="font-body text-[9.5px] text-ink-500">{label}</span><span className={`font-display truncate text-right text-[10px] font-semibold tabular-nums ${tone}`}>{value}</span></div>;
}
