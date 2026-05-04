"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Mail, Linkedin, Phone, MessageSquare, Send, Calendar } from "lucide-react";
import { Typewriter } from "./Typewriter";

/**
 * Sequence Builder Mock — animated recreation of the campaign editor
 * (Lane launch). Vertical timeline draws itself top-down; each node
 * lights up cyan as the connecting line reaches it. The right panel
 * shows the email composer with subject + body typing in parallel.
 *
 * Generic VN→US lane play — never references real customer data.
 */
const STEPS = [
  { day: 1, type: "EMAIL", icon: Mail, label: "Lane-launch intro", tint: "#3b82f6" },
  { day: 3, type: "LINKEDIN INVITE", icon: Linkedin, label: "Connection request", tint: "#0a66c2" },
  { day: 5, type: "EMAIL", icon: Mail, label: "Volume insight", tint: "#3b82f6" },
  { day: 7, type: "CALL TASK", icon: Phone, label: "Discovery call", tint: "#8b5cf6" },
  { day: 9, type: "EMAIL", icon: Mail, label: "Case study", tint: "#3b82f6" },
  { day: 11, type: "EMAIL", icon: MessageSquare, label: "Break-up", tint: "#3b82f6" },
];

const SUBJECT = "Re: VN→US volume +18%, what we're seeing";
const BODY =
  "Hi {{first_name}},\n\nNoticed you've added 4 new VN origin ports this quarter — your volume is in the top 10% of growers we track on this lane.\n\nMost teams making that jump end up renegotiating carrier-mix within ~3 weeks of expansion. We help importers benchmark routing variance + spot/contract gaps before that conversation lands.\n\nWorth a 15-min comparison vs. your current setup?\n\n— V";

export function SequenceBuilderMock({ className = "" }: { className?: string }) {
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
          app.logisticintel.com / campaigns / lane-launch — draft
        </span>
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
              Lane launch — VN → US
            </div>
            <div className="font-mono text-[10.5px] text-ink-500">
              Seeded from <span className="text-ink-900">Lane launch</span> · 6 steps · 11 days
            </div>
          </div>
          <span
            className="font-mono ml-auto inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              color: "#f59e0b",
              borderColor: "rgba(245,158,11,0.3)",
              background: "rgba(245,158,11,0.08)",
            }}
          >
            Draft
          </span>
          <button
            className="font-display inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold text-white shadow-sm"
            style={{ background: "linear-gradient(180deg,#10b981,#059669)" }}
          >
            <Send className="h-3.5 w-3.5" /> Launch
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Sequence timeline */}
          <div className="relative">
            {/* Vertical line that draws itself */}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={inView ? { scaleY: 1 } : {}}
              transition={{ duration: 1.6, ease: "easeOut" }}
              className="absolute left-[15px] top-3 bottom-3 w-[2px] origin-top"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#06b6d4 50%,#8b5cf6 100%)" }}
            />
            <ul className="relative space-y-3">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.li
                    key={s.day}
                    initial={{ opacity: 0, x: -12 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.25 + i * 0.18, duration: 0.4, ease: "easeOut" }}
                    className="flex items-center gap-3"
                  >
                    <div
                      className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white"
                      style={{ borderColor: s.tint }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: s.tint }} />
                    </div>
                    <div className="min-w-0 flex-1 rounded-lg border border-ink-100 bg-white px-3 py-2 shadow-xs">
                      <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-ink-200">
                        Day {s.day} · {s.type}
                      </div>
                      <div className="font-display truncate text-[12px] font-semibold text-ink-900">
                        {s.label}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>

          {/* Email composer */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="rounded-xl border border-ink-100 bg-ink-25 p-4"
          >
            <div className="font-display mb-2 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-brand-blue" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-200">
                Day 5 · Email · Compose
              </span>
              <span className="font-mono ml-auto text-[10px] text-ink-200">
                <Calendar className="mr-1 inline h-3 w-3" />
                Send window: 9–11am local
              </span>
            </div>

            {/* Subject */}
            <div className="rounded-lg border border-ink-100 bg-white px-3 py-2">
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-ink-200">
                Subject
              </div>
              <div className="font-display mt-0.5 text-[13px] font-semibold text-ink-900">
                <Typewriter text={SUBJECT} start={inView} cps={55} />
              </div>
            </div>

            {/* Body */}
            <div className="mt-2 rounded-lg border border-ink-100 bg-white p-3">
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-ink-200">
                Body
              </div>
              <div className="font-body mt-1 whitespace-pre-line text-[12.5px] leading-[1.55] text-ink-700">
                <Typewriter text={BODY} start={inView} cps={180} caret />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["{{first_name}}", "{{company_name}}", "{{top_lane}}", "{{sender_name}}"].map((tok) => (
                  <span
                    key={tok}
                    className="font-mono inline-flex items-center rounded border px-2 py-0.5 text-[9.5px] font-medium"
                    style={{
                      color: "#2563eb",
                      borderColor: "rgba(37,99,235,0.25)",
                      background: "rgba(37,99,235,0.06)",
                    }}
                  >
                    {tok}
                  </span>
                ))}
              </div>
            </div>

            {/* Forecast strip */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Forecast label="Predicted opens" value="48–62%" tone="#3b82f6" />
              <Forecast label="Predicted replies" value="6–9%" tone="#10b981" />
              <Forecast label="Predicted meetings" value="1.4×" tone="#8b5cf6" />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Forecast({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-2.5 py-2">
      <div className="font-display text-[9px] font-bold uppercase tracking-wider text-ink-200">
        {label}
      </div>
      <div className="font-mono mt-0.5 text-[14px] font-semibold tracking-[-0.01em]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}
