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
 * needing a video. Pass `dark` to render on a Pulse-Coach surface
 * (the home page's Signal → Pipeline section is dark-bg).
 */
export function WorkflowMotion({
  className = "",
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  // Dark variant — cards on a slate surface, cyan-glow numbers, white text.
  // Light variant — original blue-tinted icon, ink-900 labels, white card.
  const cardCls = dark
    ? "relative flex flex-col gap-3 rounded-2xl border border-white/10 p-5 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.5)]"
    : "relative flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm";
  const cardStyle = dark
    ? {
        background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.15)",
      }
    : undefined;
  const numCls = dark
    ? "font-mono inline-flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold"
    : "flex h-8 w-8 items-center justify-center rounded-lg";
  const numStyle = dark
    ? {
        background: "linear-gradient(180deg,#0b1220,#020617)",
        color: "#00F0FF",
        boxShadow:
          "0 0 0 1px rgba(0,240,255,0.4), 0 0 12px rgba(0,240,255,0.2)",
      }
    : { background: "rgba(37,99,235,0.08)", boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)" };
  const stepLblCls = dark
    ? "font-display text-[10.5px] font-bold uppercase tracking-[0.08em]"
    : "font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-200";
  const stepLblStyle = dark ? { color: "rgba(0,240,255,0.7)" } : undefined;
  const titleCls = dark
    ? "font-display text-[14px] font-semibold leading-tight text-white"
    : "font-display text-[14px] font-semibold leading-tight text-ink-900";
  const bodyCls = dark
    ? "font-body text-[12.5px] leading-snug text-ink-150"
    : "font-body text-[12.5px] leading-snug text-ink-500";

  // Race-effect timing (dark variant only).
  // Runner travels 5% → 95% over RACE_S; brief PAUSE_S at each end keeps
  // the race readable. Each card's number badge pulses at delay = i * (RACE_S / 5)
  // so the pulse "runs through" the cards in sequence.
  const RACE_S = 5;
  const PAUSE_S = 0.6;
  const CYCLE_S = RACE_S + PAUSE_S;
  const PULSE_S = 0.55;

  return (
    <div className={`relative grid grid-cols-1 gap-3 md:grid-cols-5 ${className}`}>
      {dark && (
        <>
          {/* Dim base track */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-[5%] right-[5%] top-7 hidden h-px md:block"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(0,240,255,0.22), rgba(59,130,246,0.22), transparent)",
            }}
          />
          {/* Racing fill — bright cyan growing 0% → 90% width on loop */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-[5%] top-7 hidden h-[2px] md:block"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,240,255,0.95), rgba(59,130,246,0.7))",
              boxShadow: "0 0 8px rgba(0,240,255,0.5)",
            }}
            initial={{ width: "0%" }}
            animate={
              prefersReducedMotion
                ? { width: "90%" }
                : { width: ["0%", "0%", "90%", "90%"] }
            }
            transition={
              prefersReducedMotion
                ? undefined
                : {
                    duration: CYCLE_S,
                    times: [0, PAUSE_S / CYCLE_S / 2, RACE_S / CYCLE_S, 1],
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
            }
          />
          {/* Leading runner dot — racing across the line */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-7 hidden h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full md:block"
            style={{
              background: "#00F0FF",
              boxShadow:
                "0 0 14px 4px rgba(0,240,255,0.7), 0 0 28px 10px rgba(0,240,255,0.35)",
            }}
            initial={{ left: "5%" }}
            animate={
              prefersReducedMotion
                ? undefined
                : { left: ["5%", "5%", "95%", "95%"] }
            }
            transition={
              prefersReducedMotion
                ? undefined
                : {
                    duration: CYCLE_S,
                    times: [0, PAUSE_S / CYCLE_S / 2, RACE_S / CYCLE_S, 1],
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
            }
          />
        </>
      )}
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isLast = i === STEPS.length - 1;
        // Each card pulses when the runner is at its position. Card i peak
        // delay is i * (RACE_S / 4) so card 0 pulses at the start of the race
        // and card 4 pulses just before the end.
        const pulseDelay = (i * RACE_S) / (STEPS.length - 1);
        return (
          <motion.div
            key={s.label}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: i * 0.12, duration: 0.4, ease: "easeOut" }}
            className={cardCls}
            style={cardStyle}
          >
            <div className="flex items-center gap-2.5">
              {dark ? (
                <motion.div
                  className={numCls}
                  style={numStyle}
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : {
                          scale: [1, 1.18, 1],
                          boxShadow: [
                            "0 0 0 1px rgba(0,240,255,0.4), 0 0 12px rgba(0,240,255,0.2)",
                            "0 0 0 2px rgba(0,240,255,0.95), 0 0 28px 6px rgba(0,240,255,0.65)",
                            "0 0 0 1px rgba(0,240,255,0.4), 0 0 12px rgba(0,240,255,0.2)",
                          ],
                        }
                  }
                  transition={
                    prefersReducedMotion
                      ? undefined
                      : {
                          duration: PULSE_S,
                          delay: pulseDelay,
                          repeat: Infinity,
                          repeatDelay: CYCLE_S - PULSE_S,
                          ease: "easeInOut",
                        }
                  }
                >
                  {String(i + 1).padStart(2, "0")}
                </motion.div>
              ) : (
                <div className={numCls} style={numStyle}>
                  <Icon className="h-4 w-4 text-brand-blue" />
                </div>
              )}
              <div className={stepLblCls} style={stepLblStyle}>
                {dark ? (
                  <Icon className="h-3.5 w-3.5 inline-block align-[-2px]" />
                ) : (
                  <>Step {i + 1}</>
                )}
                {dark && <span className="ml-1.5">{s.label.split(" ")[0]}</span>}
              </div>
            </div>
            <div className={titleCls}>{s.label}</div>
            <div className={bodyCls}>{s.body}</div>
            {/* Connector dot — pulses in sequence (light variant only —
                dark variant uses the gradient line behind the cards). */}
            {!dark && (
              <motion.span
                aria-hidden
                className="absolute -right-1.5 top-1/2 hidden h-3 w-3 -translate-y-1/2 rounded-full md:block"
                style={{
                  background: "#00F0FF",
                  boxShadow: "0 0 12px rgba(0,240,255,0.6)",
                  opacity: isLast ? 0 : 1,
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
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
