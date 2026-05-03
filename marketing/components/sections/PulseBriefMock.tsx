"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Sparkles, Copy, FileDown, Share2, RefreshCw } from "lucide-react";
import { Typewriter } from "./Typewriter";
import { CountUp } from "./CountUp";

/**
 * Pulse Brief Mock — animated recreation of the AI · Account
 * Intelligence modal. Triggers on scroll-into-view:
 *   1. Modal scaffold fades in
 *   2. Executive summary types itself
 *   3. KPIs count up
 *   4. 4 opportunity-signal cards stagger in (color-coded)
 *   5. 3 outreach hooks fade in
 *
 * Generic shipper "Acme Industries Inc." — never references real
 * customer accounts.
 */
const SUMMARY =
  "Acme Industries is a leading mid-market importer headquartered in the U.S. with significant trans-Pacific volume from Vietnam and South Korea. Recent shipment cadence (+18% MoM) signals supply-chain expansion, and a recent carrier shift from OOCL to Hapag-Lloyd indicates active sourcing decisions. This presents an opening to position alternative routing options and freight optimization services.";

const SIGNALS = [
  {
    label: "BUYING SIGNAL",
    accent: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    body: "Volume up 18% MoM with 4 new origin ports activated in last 30 days — clear capacity expansion.",
  },
  {
    label: "FORWARDER DISPLACEMENT",
    accent: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    body: "Switched primary forwarder mid-quarter — open window to position alternate routing now.",
  },
  {
    label: "CARRIER OPPORTUNITY",
    accent: "#3b82f6",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.2)",
    body: "Increased reliance on Hapag-Lloyd suggests carrier-mix consolidation; pricing leverage moment.",
  },
  {
    label: "SUPPLIER SIGNAL",
    accent: "#8b5cf6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.2)",
    body: "5 new BOL counterparties in last 60 days — active sourcing diversification underway.",
  },
];

const HOOKS = [
  {
    type: "EMAIL",
    subject: "Re: VN→US lane expansion — quick question",
    preview:
      "Hi {{first_name}}, noticed you've added 4 new VN origin ports this quarter. We've been helping similar importers cut transit variance by 22% on this lane — open to a 15-min comparison?",
  },
  {
    type: "EMAIL",
    subject: "Carrier-shift playbook for Q-end",
    preview:
      "Saw the OOCL→Hapag-Lloyd transition. Most teams making this move discover spot vs. contract gaps within 3 weeks. Worth a quick benchmark?",
  },
  {
    type: "LINKEDIN",
    subject: "Volume +18% — congrats",
    preview:
      "Hi {{first_name}}, your VN volume is among the top 10% growers we track this quarter. Curious how you're handling the carrier mix — happy to share what other teams in your sector are doing.",
  },
];

export function PulseBriefMock({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)] ${className}`}
    >
      {/* Modal header — Pulse Coach surface */}
      <div
        className="relative overflow-hidden px-5 py-4 text-white"
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
        <div className="relative flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: "#00F0FF" }} />
          <span
            className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "#00F0FF" }}
          >
            Pulse AI · Account Intelligence
          </span>
          <div className="ml-auto flex items-center gap-2 opacity-70">
            <RefreshCw className="h-3.5 w-3.5" />
            <Copy className="h-3.5 w-3.5" />
            <Share2 className="h-3.5 w-3.5" />
            <FileDown className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="font-display relative mt-2 text-[20px] font-semibold tracking-[-0.015em]">
          Acme Industries Inc.
        </div>
        <div className="font-mono relative text-[11px] text-ink-150">
          Fremont, CA · 18,888 TEU/yr · Automotive
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Executive summary */}
        <Section index="01" title="Executive Account Summary">
          <p className="font-body text-[13px] leading-[1.55] text-ink-700">
            <Typewriter text={SUMMARY} start={inView} cps={120} caret />
          </p>
        </Section>

        {/* Trade activity snapshot */}
        <Section index="02" title="Trade Activity Snapshot">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="12m TEU" value={<CountUp to={18888} format={(n) => Math.round(n).toLocaleString()} start={inView} />} />
            <Stat
              label="Shipments (12m)"
              value={<CountUp to={7862} format={(n) => Math.round(n).toLocaleString()} start={inView} />}
            />
            <Stat label="Active lanes" value={<CountUp to={10} format={(n) => Math.round(n).toString()} start={inView} />} />
            <Stat label="Top lane" value="VN → US" />
          </div>
        </Section>

        {/* Opportunity signals */}
        <Section index="03" title="Opportunity Signals">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {SIGNALS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1.4 + i * 0.12, duration: 0.35, ease: "easeOut" }}
                className="rounded-lg border px-3 py-2.5"
                style={{ background: s.bg, borderColor: s.border }}
              >
                <div
                  className="font-display text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: s.accent }}
                >
                  {s.label}
                </div>
                <div className="font-body mt-1 text-[12px] leading-snug text-ink-700">{s.body}</div>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* Outreach hooks */}
        <Section index="04" title="Suggested Outreach Hooks">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {HOOKS.map((h, i) => (
              <motion.div
                key={h.subject}
                initial={{ opacity: 0, y: 12 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 2.0 + i * 0.12, duration: 0.35, ease: "easeOut" }}
                className="rounded-lg border border-ink-100 bg-ink-25 p-3"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-mono inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{
                      color: h.type === "EMAIL" ? "#2563eb" : "#0a66c2",
                      borderColor: h.type === "EMAIL" ? "rgba(37,99,235,0.3)" : "rgba(10,102,194,0.3)",
                      background: h.type === "EMAIL" ? "rgba(37,99,235,0.08)" : "rgba(10,102,194,0.08)",
                    }}
                  >
                    {h.type}
                  </span>
                </div>
                <div className="font-display mt-1.5 text-[12.5px] font-semibold leading-snug text-ink-900">
                  {h.subject}
                </div>
                <div className="font-body mt-1.5 text-[11.5px] leading-snug text-ink-500 line-clamp-3">
                  {h.preview}
                </div>
                <button className="font-display mt-2 inline-flex items-center gap-1 text-[10.5px] font-semibold text-brand-blue hover:text-brand-blue-700">
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </motion.div>
            ))}
          </div>
        </Section>
      </div>

      {/* Confidence footer */}
      <div className="flex items-center justify-between border-t border-ink-100 bg-ink-25 px-5 py-2.5">
        <span className="font-body text-[11px] text-ink-500">Was this brief useful?</span>
        <span
          className="font-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
          style={{
            color: "#10b981",
            borderColor: "rgba(16,185,129,0.3)",
            background: "rgba(16,185,129,0.08)",
          }}
        >
          Confidence 95%
        </span>
      </div>
    </div>
  );
}

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-display mb-2 flex items-center gap-2">
        <span
          className="font-mono inline-flex h-5 w-5 items-center justify-center rounded text-[9.5px] font-bold"
          style={{
            color: "#0F172A",
            background: "rgba(0,240,255,0.18)",
            boxShadow: "inset 0 0 0 1px rgba(0,240,255,0.35)",
          }}
        >
          {index}
        </span>
        <span className="text-[12px] font-semibold tracking-[-0.005em] text-ink-900">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-25 px-3 py-2">
      <div className="font-display text-[9.5px] font-bold uppercase tracking-wider text-ink-200">
        {label}
      </div>
      <div className="font-mono mt-0.5 text-[16px] font-semibold tracking-[-0.01em] text-brand-blue-700">
        {value}
      </div>
    </div>
  );
}
