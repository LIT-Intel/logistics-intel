"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Mail, Linkedin, Lock, Check } from "lucide-react";

/**
 * Contact Discovery Mock — animated recreation of the "Find contacts
 * with LIT" panel. Loops:
 *   1. Title / seniority / dept chips appear
 *   2. 3 chips highlight as "selected"
 *   3. Result list streams in with HIDDEN status pills
 *   4. Last cycle: one row's pills flip from HIDDEN → revealed email
 *      with green checkmark (the "enrich" payoff moment)
 *
 * Generic shipper "Acme Industries" — never references real customer
 * data.
 */

const TITLES = [
  "Logistics Manager",
  "Supply Chain Manager",
  "Transportation Manager",
  "Import Manager",
  "Customs Manager",
  "Procurement Director",
  "VP Supply Chain",
  "Director of Logistics",
];

const SELECTED_TITLES = new Set(["Logistics Manager", "Supply Chain Manager", "VP Supply Chain"]);

const CONTACTS = [
  { name: "Roshan", title: "Vice President Supply Chain", initial: "R", tint: "#ef4444" },
  { name: "Tanay", title: "Supply Chain Manager", initial: "T", tint: "#10b981" },
  { name: "Francisco", title: "Supply Chain Manager", initial: "F", tint: "#f59e0b" },
  { name: "Meet", title: "Supply Chain Manager", initial: "M", tint: "#f97316" },
  { name: "Sajal", title: "Logistics Manager", initial: "S", tint: "#06b6d4" },
];

export function ContactDiscoveryMock({ className = "" }: { className?: string }) {
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cycle: rest → reveal one row → reset every 8 seconds
  useEffect(() => {
    if (!ref.current) return;
    let timeout: ReturnType<typeof setTimeout>;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          const cycle = () => {
            setRevealed(true);
            timeout = setTimeout(() => {
              setRevealed(false);
              timeout = setTimeout(cycle, 4000);
            }, 4000);
          };
          timeout = setTimeout(cycle, 2200);
          obs.disconnect();
        }
      },
      { rootMargin: "-60px" },
    );
    obs.observe(ref.current);
    return () => {
      obs.disconnect();
      clearTimeout(timeout);
    };
  }, []);

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
          app.logisticintel.com / company / acme-industries / contacts
        </span>
      </div>

      <div className="p-5">
        {/* LIT contact search header */}
        <div
          className="rounded-xl border px-4 py-3.5"
          style={{
            background: "rgba(167,139,250,0.06)",
            borderColor: "rgba(167,139,250,0.2)",
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" style={{ color: "#8b5cf6" }} />
            <span
              className="font-display text-[10.5px] font-bold uppercase tracking-[0.1em]"
              style={{ color: "#8b5cf6" }}
            >
              LIT contact search · 50 previews
            </span>
            <span className="font-mono ml-auto text-[10px] text-ink-200">Acme Industries</span>
          </div>

          {/* Title chips */}
          <div className="mt-3">
            <div className="font-display mb-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-200">
              Titles
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TITLES.map((t, i) => {
                const selected = SELECTED_TITLES.has(t);
                return (
                  <motion.span
                    key={t}
                    initial={{ opacity: 0, y: 6 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="font-mono rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium"
                    style={
                      selected
                        ? {
                            color: "#8b5cf6",
                            borderColor: "rgba(139,92,246,0.5)",
                            background: "rgba(139,92,246,0.12)",
                          }
                        : {
                            color: "#94a3b8",
                            borderColor: "rgba(148,163,184,0.3)",
                            background: "white",
                          }
                    }
                  >
                    {t}
                  </motion.span>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="font-display mb-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-200">
                Seniority
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Manager", "Director", "VP", "Head"].map((s) => (
                  <span
                    key={s}
                    className="font-mono rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium"
                    style={{
                      color: "#94a3b8",
                      borderColor: "rgba(148,163,184,0.3)",
                      background: "white",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="font-display mb-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-200">
                Department
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Operations", "Supply Chain", "Logistics", "Procurement"].map((d) => (
                  <span
                    key={d}
                    className="font-mono rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium"
                    style={{
                      color: "#94a3b8",
                      borderColor: "rgba(148,163,184,0.3)",
                      background: "white",
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            className="font-display mt-3 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11.5px] font-semibold text-white"
            style={{ background: "linear-gradient(180deg,#8b5cf6,#7c3aed)" }}
          >
            <Sparkles className="h-3 w-3" /> Re-run search
          </button>
        </div>

        {/* Results */}
        <div className="mt-4">
          {/* Header row — 12-col layout only on sm+. On mobile we just show the contact row, no header (rows have inline labels). */}
          <div className="font-display mb-2 hidden grid-cols-12 px-3 text-[9.5px] font-bold uppercase tracking-wider text-ink-200 sm:grid">
            <span className="col-span-5">Contact</span>
            <span className="col-span-3">Title</span>
            <span className="col-span-2">Email</span>
            <span className="col-span-2 text-right">LinkedIn</span>
          </div>
          <div className="divide-y divide-ink-100 rounded-lg border border-ink-100 bg-white">
            {CONTACTS.map((c, i) => {
              const isRevealed = revealed && i === 0;
              return (
                <motion.div
                  key={c.name}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: 0.4 + i * 0.08, duration: 0.32 }}
                  className="flex items-center gap-2 px-3 py-2.5 sm:grid sm:grid-cols-12"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:col-span-5 sm:flex-initial">
                    <div
                      className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: c.tint }}
                    >
                      {c.initial}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display truncate text-[12px] font-semibold text-ink-900">
                        {c.name}
                      </div>
                      <div className="font-mono truncate text-[10px] text-ink-200">{c.title}</div>
                    </div>
                  </div>
                  <div className="font-body hidden truncate text-[11.5px] text-ink-700 sm:col-span-3 sm:block">{c.title}</div>
                  <div className="shrink-0 sm:col-span-2">
                    <AnimatePresence mode="wait">
                      {isRevealed ? (
                        <motion.span
                          key="revealed"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="font-mono inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold"
                          style={{
                            color: "#10b981",
                            background: "rgba(16,185,129,0.1)",
                            borderColor: "rgba(16,185,129,0.3)",
                          }}
                        >
                          <Check className="h-2.5 w-2.5" /> verified
                        </motion.span>
                      ) : (
                        <motion.span
                          key="hidden"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="font-mono inline-flex items-center gap-1 rounded-full border border-ink-100 bg-ink-25 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-ink-200"
                        >
                          <Lock className="h-2.5 w-2.5" /> hidden
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="hidden text-right sm:col-span-2 sm:block">
                    {isRevealed ? (
                      <span className="inline-flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-brand-blue" />
                        <Linkedin className="h-3.5 w-3.5 text-[#0a66c2]" />
                      </span>
                    ) : (
                      <span className="font-mono text-[9.5px] text-ink-200">—</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[10.5px] text-ink-200">
              {revealed ? "1 enriched · 4 ready to enrich" : "0 enriched · 5 ready to enrich"}
            </span>
            <button
              className="font-display inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold text-white"
              style={{ background: "linear-gradient(180deg,#8b5cf6,#7c3aed)" }}
            >
              <Sparkles className="h-3 w-3" /> Enrich selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
