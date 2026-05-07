"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, Search, Zap, Send, CheckCircle2 } from "lucide-react";

const STEPS = [
  { icon: Search, label: "Pulse query", body: "EV battery importers shipping from Korea" },
  { icon: Sparkles, label: "Coach reasons", body: "27 matches, 8 with volume up MoM" },
  { icon: Zap, label: "Triggers fire", body: "Save companies, queue contacts, draft emails" },
  { icon: Send, label: "Campaign launches", body: "12 contacts, 4 importers, day-1 delivery" },
  { icon: CheckCircle2, label: "Replies land", body: "3 meetings booked, pipeline built" },
];

/**
 * Animated workflow strip used on the homepage and /pulse. Each step
 * pulses in sequence — communicates "signal becomes pipeline" without
 * needing a video.
 */
export function WorkflowMotion({ className = "" }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className={`grid grid-cols-1 gap-3 md:grid-cols-5 ${className}`}>
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        return (
          <motion.div
            key={s.label}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: i * 0.12, duration: 0.4, ease: "easeOut" }}
            className="relative flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  background: "rgba(37,99,235,0.08)",
                  boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                }}
              >
                <Icon className="h-4 w-4 text-brand-blue" />
              </div>
              <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-200">
                Step {i + 1}
              </div>
            </div>
            <div className="font-display text-[14px] font-semibold leading-tight text-ink-900">
              {s.label}
            </div>
            <div className="font-body text-[12.5px] leading-snug text-ink-500">{s.body}</div>
            {/* Connector dot — pulses in sequence */}
            <motion.span
              aria-hidden
              className="absolute -right-1.5 top-1/2 hidden h-3 w-3 -translate-y-1/2 rounded-full md:block"
              style={{
                background: "#00F0FF",
                boxShadow: "0 0 12px rgba(0,240,255,0.6)",
                opacity: i === STEPS.length - 1 ? 0 : 1,
              }}
              animate={
                prefersReducedMotion
                  ? undefined
                  : { scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }
              }
              transition={
                prefersReducedMotion
                  ? undefined
                  : { delay: i * 0.4, duration: 1.6, repeat: Infinity }
              }
            />
          </motion.div>
        );
      })}
    </div>
  );
}
