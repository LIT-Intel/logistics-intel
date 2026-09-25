"use client";

// Freight ROI Calculator — platform-ROI conversion asset (inspired by
// getoptimus.ai/roi-calculator, but interactive instead of fixed tiers).
// Pure client-side math, no signup gate, no provider cost.
//
// Apple-design applied (WWDC "Designing Fluid Interfaces"):
//  - Sliders track 1:1 (native range = instant pointer-down response + a11y)
//    with a live value readout that updates continuously during the drag.
//  - Result numbers animate with a critically-damped spring (no overshoot —
//    a dollar figure that bounces reads wrong) from the CURRENT on-screen
//    value, so rapid input changes stay continuous and interruptible.
//  - Translucent result card (backdrop-filter) as a floating material layer;
//    big number uses negative tracking + tabular-nums.
//  - prefers-reduced-motion: numbers snap, no count animation.

import { useEffect, useMemo, useState } from "react";
import {
  useSpring,
  useTransform,
  motion,
  useReducedMotion,
} from "framer-motion";
import { APP_URL } from "@/lib/app-urls";

type PlanKey = "starter" | "growth" | "scale";
const PLANS: Record<PlanKey, { label: string; monthly: number }> = {
  starter: { label: "Starter", monthly: 150 },
  growth: { label: "Growth", monthly: 499 },
  scale: { label: "Scale", monthly: 1250 },
};

// Fixed, disclosed assumption: accounts are won throughout the year, so on
// average a year-1 account ships ~6 of 12 months. Keeps the headline honest.
const AVG_ACTIVE_MONTHS_Y1 = 6;

type Slider = {
  key: "reps" | "newShippers" | "loads" | "revPerLoad" | "marginPct";
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  prefix?: string;
  help: string;
};

const SLIDERS: Slider[] = [
  { key: "reps", label: "Sales reps", min: 1, max: 50, step: 1, help: "People prospecting for new shippers." },
  { key: "newShippers", label: "New shippers won / rep / year", min: 1, max: 12, step: 1, help: "Extra accounts each rep wins with better targeting." },
  { key: "loads", label: "Loads / shipper / month", min: 1, max: 60, step: 1, help: "Average monthly load count per new account." },
  { key: "revPerLoad", label: "Revenue / load", min: 300, max: 6000, step: 50, prefix: "$", help: "Average all-in revenue per load." },
  { key: "marginPct", label: "Gross margin", min: 5, max: 30, step: 1, suffix: "%", help: "Average gross margin on that revenue." },
];

const DEFAULTS = { reps: 5, newShippers: 2, loads: 12, revPerLoad: 1500, marginPct: 12 };

function usd(n: number): string {
  const v = Math.round(n);
  return "$" + v.toLocaleString("en-US");
}

/** Critically-damped spring-driven number (Apple: no overshoot on figures).
 *  Under prefers-reduced-motion the spring is bypassed entirely — the value
 *  snaps, no count animation. */
function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 110, damping: 22, mass: 1 });
  useEffect(() => { spring.set(value); }, [value, spring]);
  const text = useTransform(spring, (v) => format(v));
  if (reduce) {
    return <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>{format(value)}</span>;
  }
  return <motion.span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>{text}</motion.span>;
}

export function RoiCalculatorClient() {
  const [plan, setPlan] = useState<PlanKey>("growth");
  const [v, setV] = useState({ ...DEFAULTS });

  const result = useMemo(() => {
    const addedGp =
      v.reps *
      v.newShippers *
      v.loads *
      AVG_ACTIVE_MONTHS_Y1 *
      v.revPerLoad *
      (v.marginPct / 100);
    const litCost = PLANS[plan].monthly * 12;
    const net = addedGp - litCost;
    const roiX = litCost > 0 ? addedGp / litCost : 0;
    return { addedGp, litCost, net, roiX };
  }, [v, plan]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      {/* Inputs */}
      <div className="rounded-3xl border border-ink-100 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[18px] font-semibold text-ink-900">Your brokerage</h2>
          <button
            type="button"
            onClick={() => { setV({ ...DEFAULTS }); setPlan("growth"); }}
            className="rounded-lg border border-ink-100 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-500 transition active:scale-95 hover:text-ink-900"
          >
            Reset
          </button>
        </div>

        <div className="space-y-6">
          {SLIDERS.map((s) => {
            const val = v[s.key];
            const pct = ((val - s.min) / (s.max - s.min)) * 100;
            const display = (s.prefix ?? "") + val.toLocaleString("en-US") + (s.suffix ?? "");
            return (
              <div key={s.key}>
                <div className="flex items-baseline justify-between">
                  <label htmlFor={s.key} className="font-display text-[13.5px] font-semibold text-ink-900">{s.label}</label>
                  <span className="font-display text-[15px] font-bold text-blue-700" style={{ fontVariantNumeric: "tabular-nums" }}>{display}</span>
                </div>
                <input
                  id={s.key}
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={val}
                  onChange={(e) => setV((p) => ({ ...p, [s.key]: Number(e.target.value) }))}
                  className="roi-slider mt-2 w-full"
                  style={{ ["--pct" as string]: `${pct}%` }}
                  aria-describedby={`${s.key}-help`}
                />
                <p id={`${s.key}-help`} className="mt-1.5 font-body text-[11.5px] leading-snug text-ink-400">{s.help}</p>
              </div>
            );
          })}

          {/* Plan selector */}
          <div>
            <div className="font-display text-[13.5px] font-semibold text-ink-900">Your LIT plan</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(Object.keys(PLANS) as PlanKey[]).map((k) => {
                const active = plan === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPlan(k)}
                    aria-pressed={active}
                    className={[
                      "rounded-xl border px-3 py-3 text-center transition active:scale-[0.97] motion-reduce:active:scale-100",
                      active
                        ? "border-blue-300 bg-blue-50 shadow-sm"
                        : "border-ink-100 bg-white hover:border-blue-200",
                    ].join(" ")}
                  >
                    <div className={["font-display text-[13.5px] font-semibold", active ? "text-blue-700" : "text-ink-900"].join(" ")}>{PLANS[k].label}</div>
                    <div className="font-body text-[11.5px] text-ink-400" style={{ fontVariantNumeric: "tabular-nums" }}>${PLANS[k].monthly}/mo</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Result — translucent dark material card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0B1220] via-[#0F172A] to-[#111a2e] p-6 text-white shadow-glow-blue sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300/90">Estimated first-year value</div>
          <div className="mt-2 flex items-end gap-2">
            <AnimatedNumber
              value={Math.max(result.net, 0)}
              format={usd}
              className="font-display text-[clamp(2.4rem,6vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.03em] text-white"
            />
            <span className="mb-2 text-[15px] font-semibold text-cyan-300">net</span>
          </div>
          <p className="mt-1 font-body text-[12.5px] text-slate-300/90">
            Added gross profit minus your annual LIT cost. An estimate from your inputs — not a quote.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Added GP / yr" value={<AnimatedNumber value={result.addedGp} format={usd} />} />
            <Stat label="LIT cost / yr" value={<AnimatedNumber value={result.litCost} format={usd} />} />
            <Stat
              label="Return"
              value={<AnimatedNumber value={result.roiX} format={(n) => `${n < 100 ? n.toFixed(1) : Math.round(n)}×`} />}
              accent
            />
          </div>

          <a
            href={`${APP_URL}/signup`}
            className="mt-7 flex h-12 w-full items-center justify-center rounded-xl bg-cyan-400 px-6 text-[14px] font-bold text-[#0B1220] shadow-glow-cyan transition active:scale-[0.98] hover:bg-cyan-300 motion-reduce:active:scale-100"
          >
            Start a free 7-day trial
          </a>
          <a href="/demo" className="mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-white/15 px-6 text-[13.5px] font-semibold text-white/90 transition hover:border-white/30">
            Book a demo
          </a>

          <details className="mt-6 border-t border-white/10 pt-4 text-slate-300/90">
            <summary className="cursor-pointer font-display text-[12.5px] font-semibold text-white/90">Assumptions</summary>
            <p className="mt-2 font-body text-[12px] leading-relaxed">
              Added gross profit = reps × new shippers won per rep per year × loads per shipper per month ×{" "}
              {AVG_ACTIVE_MONTHS_Y1} avg active months in year 1 × revenue per load × gross margin. Year-1 accounts
              are assumed to ship ~{AVG_ACTIVE_MONTHS_Y1} of 12 months on average (won throughout the year). LIT cost
              is your selected plan billed monthly × 12. Every figure is an estimate based on the inputs you provide.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className={["mt-1 font-display text-[18px] font-bold", accent ? "text-cyan-300" : "text-white"].join(" ")}>{value}</div>
    </div>
  );
}
