"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { Anchor, TrendingDown, RefreshCw } from "lucide-react";
import { CountUp } from "./CountUp";

/**
 * Rate Benchmark Mock — stylized recreation of the in-app rate-benchmark
 * tab for marketing use. Generic FBX12 reference set. On scroll-into-view
 * the lane chart line draws, the rate KPI counts up, and the lane mix
 * bars fade-fill in sequence.
 *
 * Source-of-truth lives in `frontend/src/components/company/CDPRateBenchmark.tsx`
 * (1,000+ lines, real data). This is a 1:1 visual story without the
 * heavy charting deps.
 */
export function RateBenchmarkMock({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const prefersReduce = useReducedMotion();
  const animate = inView && !prefersReduce;

  // Synthesized FBX12 trend — last 12 weeks. Goes from $4,820 down to
  // $3,640 with a small reflexive bounce so the line has shape, not a
  // pure linear slope. Values used both for the path coords and the
  // KPI count-up.
  const trend = [4820, 4750, 4690, 4520, 4380, 4220, 4080, 3960, 3820, 3740, 3680, 3640];
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const points = trend.map((v, i) => {
    const x = (i / (trend.length - 1)) * 100;
    const y = 100 - ((v - min) / (max - min)) * 100;
    return `${x},${y}`;
  });
  const path = `M ${points.join(" L ")}`;

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
          app.logisticintel.com / company / acme-industries / rate-benchmark
        </span>
      </div>

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md text-white"
              style={{ background: "linear-gradient(160deg,#3b82f6,#2563eb)" }}
            >
              <Anchor className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="font-display truncate text-[14.5px] font-semibold text-ink-900">
                FBX01 · China → US West Coast
              </div>
              <div className="font-mono mt-0.5 text-[10.5px] uppercase tracking-wider text-ink-200">
                FCL · 40HC · refreshed weekly
              </div>
            </div>
          </div>
          <span
            className="font-mono inline-flex items-center gap-1 rounded-full border border-ink-100 bg-white px-2 py-0.5 text-[10px] text-ink-500"
            aria-label="Refreshed"
          >
            <RefreshCw className="h-3 w-3" /> 7d
          </span>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <KpiTile
            label="Current rate"
            value={
              <>
                <span className="font-mono text-[10px] text-ink-200">$</span>
                <CountUp to={3640} duration={1400} />
                <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-ink-500"> /40ft</span>
              </>
            }
            tone="neutral"
          />
          <KpiTile
            label="vs 30d"
            value={
              <span className="inline-flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-600">−9.4%</span>
              </span>
            }
            tone="positive"
          />
          <KpiTile
            label="Lane spend 12m"
            value={
              <>
                <span className="font-mono text-[10px] text-ink-200">$</span>
                <CountUp to={1.42} duration={1400} format={(n) => n.toFixed(2)} />
                <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-ink-500"> M</span>
              </>
            }
            tone="brand"
          />
        </div>

        {/* Trend chart */}
        <div className="mt-4 rounded-xl border border-ink-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
              FBX01 · 12-week trend
            </div>
            <div className="font-mono text-[10.5px] text-ink-200">USD / 40ft</div>
          </div>
          <div className="relative mt-3 h-[120px]">
            {/* Grid */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {[0, 25, 50, 75, 100].map((y) => (
                <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(15,23,42,0.06)" strokeWidth="0.3" />
              ))}
              {/* Filled area under curve */}
              <motion.path
                d={`${path} L 100,100 L 0,100 Z`}
                fill="url(#bench-grad)"
                initial={{ opacity: 0 }}
                animate={animate ? { opacity: 1 } : { opacity: prefersReduce ? 1 : 0 }}
                transition={{ duration: 1, delay: 0.4 }}
              />
              {/* Trend line */}
              <motion.path
                d={path}
                fill="none"
                stroke="#2563eb"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={animate ? { pathLength: 1 } : { pathLength: prefersReduce ? 1 : 0 }}
                transition={{ duration: 1.4, ease: "easeInOut" }}
                vectorEffect="non-scaling-stroke"
              />
              {/* End-point dot */}
              <motion.circle
                cx={100}
                cy={trend.length > 0 ? 100 - ((trend[trend.length - 1] - min) / (max - min)) * 100 : 0}
                r="1.6"
                fill="#2563eb"
                initial={{ opacity: 0, scale: 0 }}
                animate={animate ? { opacity: 1, scale: 1 } : { opacity: prefersReduce ? 1 : 0 }}
                transition={{ duration: 0.4, delay: 1.4 }}
                vectorEffect="non-scaling-stroke"
              />
              <defs>
                <linearGradient id="bench-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="font-mono mt-2 flex items-center justify-between text-[10px] text-ink-200">
            <span>Wk-12</span>
            <span>Wk-6</span>
            <span>Today</span>
          </div>
        </div>

        {/* Multi-lane benchmark table */}
        <div className="mt-4 rounded-xl border border-ink-100 bg-white p-4">
          <div className="font-display mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
            Lane comparison
          </div>
          <div className="space-y-2">
            {[
              { code: "FBX01", lane: "China → USWC", rate: 3640, delta: -9.4 },
              { code: "FBX02", lane: "China → USEC", rate: 4850, delta: -6.2 },
              { code: "FBX11", lane: "Europe → USEC", rate: 2980, delta: 1.8 },
            ].map((r, i) => (
              <motion.div
                key={r.code}
                className="grid grid-cols-[64px,1fr,80px,64px] items-center gap-3 rounded-md px-2 py-1.5 text-[12px]"
                initial={{ opacity: 0, x: -8 }}
                animate={animate ? { opacity: 1, x: 0 } : { opacity: prefersReduce ? 1 : 0 }}
                transition={{ duration: 0.4, delay: 0.6 + i * 0.12 }}
                style={i === 0 ? { background: "rgba(37,99,235,0.06)" } : {}}
              >
                <div className="font-mono font-semibold text-brand-blue-700">{r.code}</div>
                <div className="font-display truncate font-semibold text-ink-700">{r.lane}</div>
                <div className="font-mono text-right font-semibold text-ink-900">${r.rate.toLocaleString()}</div>
                <div className={`font-mono text-right ${r.delta < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {r.delta > 0 ? "+" : ""}
                  {r.delta}%
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: "neutral" | "positive" | "brand";
}) {
  const ring =
    tone === "brand"
      ? "ring-1 ring-brand-blue/15 bg-brand-blue/5"
      : tone === "positive"
      ? "ring-1 ring-emerald-200 bg-emerald-50/60"
      : "ring-1 ring-ink-100 bg-white";
  return (
    <div className={`rounded-lg ${ring} px-3 py-2.5`}>
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </div>
      <div className="font-display mt-1 text-[16px] font-semibold tracking-[-0.01em] text-ink-900">
        {value}
      </div>
    </div>
  );
}
