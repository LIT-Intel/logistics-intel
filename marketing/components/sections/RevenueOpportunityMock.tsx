"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import {
  Anchor,
  FileSearch,
  Truck,
  Plane,
  Warehouse as WarehouseIcon,
  CheckCircle2,
} from "lucide-react";
import { CountUp } from "./CountUp";

/**
 * Revenue Opportunity Mock — stylized recreation of the in-app revenue
 * opportunity tab. Six service-line cards with $$ size, confidence
 * badges, and a top "total addressable spend" KPI that counts up. On
 * scroll-into-view the totals count up and the service-line cards
 * stagger in.
 *
 * Source-of-truth: `frontend/src/components/company/CDPRevenueOpportunity.tsx`.
 */

type Confidence = "high" | "medium" | "low" | "insufficient";

const TONE: Record<Confidence, { label: string; bg: string; text: string; ring: string }> = {
  high: {
    label: "High",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  medium: {
    label: "Medium",
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
  },
  low: {
    label: "Low",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  insufficient: {
    label: "Insufficient",
    bg: "bg-slate-100",
    text: "text-slate-500",
    ring: "ring-slate-200",
  },
};

type ServiceLine = {
  name: string;
  icon: typeof Anchor;
  value: number;
  unit: string;
  confidence: Confidence;
  basis: string;
};

const LINES: ServiceLine[] = [
  { name: "Ocean", icon: Anchor, value: 1.42, unit: "M", confidence: "high", basis: "FBX12 × TEU 12m" },
  { name: "Customs", icon: FileSearch, value: 184, unit: "K", confidence: "high", basis: "HTS × shipments" },
  { name: "Drayage", icon: Truck, value: 312, unit: "K", confidence: "medium", basis: "Container × distance" },
  { name: "Air", icon: Plane, value: 96, unit: "K", confidence: "low", basis: "Inferred from HS mix" },
  { name: "Warehousing", icon: WarehouseIcon, value: 0, unit: "—", confidence: "insufficient", basis: "Not enough signal" },
  { name: "Trucking", icon: Truck, value: 240, unit: "K", confidence: "medium", basis: "FCL × inland tier" },
];

export function RevenueOpportunityMock({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const prefersReduce = useReducedMotion();
  const animate = inView && !prefersReduce;

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-25 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="font-mono ml-3 flex-1 truncate rounded-md border border-ink-100 bg-white px-2.5 py-1 text-[11px] text-ink-500">
          app.logisticintel.com / company / acme-industries / revenue-opportunity
        </span>
      </div>

      <div className="p-5">
        {/* Total opportunity hero */}
        <div className="rounded-2xl border border-ink-100 bg-gradient-to-br from-blue-50/50 to-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-blue">
                Total addressable spend · 12m
              </div>
              <div className="font-display mt-1.5 text-[28px] font-bold tracking-[-0.02em] text-ink-900">
                <span className="font-mono text-[14px] text-ink-200">$</span>
                <CountUp to={2.25} duration={1600} format={(n) => n.toFixed(2)} />
                <span className="font-display text-[14px] font-semibold uppercase tracking-wider text-ink-500"> M</span>
              </div>
              <div className="font-body mt-1.5 text-[12.5px] text-ink-500">
                Acme Industries · 6 service lines modeled
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-600">
                Win @ 30%
              </div>
              <div className="font-mono mt-1 text-[18px] font-bold text-emerald-700">
                $<CountUp to={675} duration={1600} />K
              </div>
              <div className="font-body mt-0.5 text-[11px] text-ink-500">expected revenue</div>
            </div>
          </div>

          {/* Win-rate scenarios */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { rate: "10%", value: "$225K", tone: "ink" },
              { rate: "30%", value: "$675K", tone: "brand" },
              { rate: "50%", value: "$1.13M", tone: "emerald" },
            ].map((s) => (
              <div
                key={s.rate}
                className={`rounded-md border px-2.5 py-2 text-center ${
                  s.tone === "brand"
                    ? "border-brand-blue/40 bg-brand-blue/5"
                    : s.tone === "emerald"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-ink-100 bg-white"
                }`}
              >
                <div className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500">
                  Win {s.rate}
                </div>
                <div
                  className={`font-mono mt-0.5 text-[14px] font-bold ${
                    s.tone === "brand"
                      ? "text-brand-blue-700"
                      : s.tone === "emerald"
                      ? "text-emerald-700"
                      : "text-ink-900"
                  }`}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Service lines */}
        <div className="mt-4">
          <div className="font-display mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
            Service lines · sized + confidence-rated
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {LINES.map((line, i) => {
              const tone = TONE[line.confidence];
              const Icon = line.icon;
              const isUsable = line.value > 0;
              return (
                <motion.div
                  key={line.name}
                  className={`rounded-xl border bg-white p-3 ${isUsable ? "border-ink-100" : "border-ink-100 opacity-70"}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={animate ? { opacity: isUsable ? 1 : 0.7, y: 0 } : { opacity: prefersReduce ? 1 : 0 }}
                  transition={{ duration: 0.35, delay: 0.4 + i * 0.08 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-md ${
                          isUsable ? "bg-blue-50 text-brand-blue" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="font-display text-[12.5px] font-bold text-ink-900">{line.name}</div>
                    </div>
                    <span
                      className={`font-mono inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
                    >
                      {tone.label}
                    </span>
                  </div>
                  <div className="font-display mt-2 text-[18px] font-bold tracking-[-0.01em] text-ink-900">
                    {isUsable ? (
                      <>
                        <span className="font-mono text-[10px] text-ink-200">$</span>
                        {line.value < 10 ? line.value.toFixed(2) : line.value.toFixed(0)}
                        <span className="font-display ml-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                          {line.unit}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-200">—</span>
                    )}
                  </div>
                  <div className="font-body mt-0.5 truncate text-[10.5px] text-ink-500">{line.basis}</div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Pulse AI tie-in */}
        <motion.div
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-brand-blue/20 p-3"
          style={{ background: "linear-gradient(135deg, rgba(0,240,255,0.06), rgba(59,130,246,0.04))" }}
          initial={{ opacity: 0 }}
          animate={animate ? { opacity: 1 } : { opacity: prefersReduce ? 1 : 0 }}
          transition={{ duration: 0.4, delay: 1.0 }}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <div className="font-display text-[12px] font-semibold text-ink-900">
              Pulse AI: pitch ocean + customs together.
            </div>
            <p className="font-body mt-0.5 text-[11.5px] leading-snug text-ink-500">
              High-confidence ocean spend ($1.42M) plus high-confidence customs ($184K) is a $1.6M
              starting wedge. Drayage + trucking add $552K once you anchor the relationship.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
