"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, BookmarkPlus, Building2 } from "lucide-react";

/**
 * Hero Pulse Search Demo — replaces the static fake-browser mockup.
 * Auto-cycles through the full Pulse flow:
 *   1. Query types itself
 *   2. "Pulse Coach reads your prompt" panel slides in
 *   3. 3 entity chips materialize one by one
 *   4. Result grid fades in with 6 generic shipper cards
 *   5. Holds, then resets to next query
 *
 * Anonymized data — never uses real customer names. All "companies"
 * are stylized generic shippers (OceanLink Logistics, Harbor & Co Freight, etc).
 */

type Scene = {
  query: string;
  intent: string;
  chips: { label: string; tone: "industry" | "lane" | "filter" }[];
  results: { name: string; mono: string; tint: string; teu: string; ship: string; lane: string }[];
};

const SCENES: Scene[] = [
  {
    query: "Furniture importers shipping from Vietnam in last 90 days",
    intent: "Industry filter",
    chips: [
      { label: "Furniture", tone: "industry" },
      { label: "Origin: VN", tone: "lane" },
      { label: "Last 90d", tone: "filter" },
    ],
    results: [
      { name: "OceanLink Logistics", mono: "OL", tint: "#3b82f6", teu: "14.2K", ship: "1,840", lane: "VN → US" },
      { name: "Harbor & Co Freight", mono: "HC", tint: "#8b5cf6", teu: "9.8K", ship: "1,121", lane: "VN → US" },
      { name: "Atlas Trade Group", mono: "AT", tint: "#06b6d4", teu: "7.4K", ship: "896", lane: "VN → US" },
      { name: "Pacific Bridge Corp", mono: "PB", tint: "#10b981", teu: "5.1K", ship: "612", lane: "VN → US" },
      { name: "Continental Movers", mono: "CM", tint: "#f59e0b", teu: "3.6K", ship: "440", lane: "VN → US" },
      { name: "Meridian Supply Co", mono: "MS", tint: "#ec4899", teu: "2.9K", ship: "318", lane: "VN → US" },
    ],
  },
  {
    query: "Wire harness shippers that switched carriers in last 60d",
    intent: "Carrier pivot",
    chips: [
      { label: "Wire harness", tone: "industry" },
      { label: "Carrier change", tone: "filter" },
      { label: "60d window", tone: "filter" },
    ],
    results: [
      { name: "Volt Components", mono: "VC", tint: "#3b82f6", teu: "11.4K", ship: "1,420", lane: "MX → US" },
      { name: "Coastal Wire Industries", mono: "CW", tint: "#8b5cf6", teu: "8.1K", ship: "974", lane: "MX → US" },
      { name: "Northridge Manufacturing", mono: "NM", tint: "#06b6d4", teu: "6.7K", ship: "812", lane: "TW → US" },
      { name: "Lumen Electrical Group", mono: "LE", tint: "#10b981", teu: "4.4K", ship: "538", lane: "MX → US" },
      { name: "Vector Cable Co", mono: "VK", tint: "#f59e0b", teu: "3.0K", ship: "366", lane: "TH → US" },
      { name: "Bridgewire Components", mono: "BW", tint: "#ec4899", teu: "2.4K", ship: "289", lane: "MX → US" },
    ],
  },
  {
    query: "EV battery imports landing in Long Beach this quarter",
    intent: "Lane + HS code",
    chips: [
      { label: "HS 8507.60", tone: "filter" },
      { label: "Dest: USLGB", tone: "lane" },
      { label: "Q-current", tone: "filter" },
    ],
    results: [
      { name: "Voltcell Industries", mono: "VI", tint: "#3b82f6", teu: "16.8K", ship: "2,011", lane: "KR → US" },
      { name: "Helix Power Systems", mono: "HP", tint: "#8b5cf6", teu: "12.3K", ship: "1,448", lane: "CN → US" },
      { name: "Northstar Energy", mono: "NE", tint: "#06b6d4", teu: "9.7K", ship: "1,156", lane: "JP → US" },
      { name: "Cellbridge Holdings", mono: "CB", tint: "#10b981", teu: "6.4K", ship: "750", lane: "KR → US" },
      { name: "Polaris Battery Co", mono: "PC", tint: "#f59e0b", teu: "4.8K", ship: "555", lane: "CN → US" },
      { name: "Quantum Charge Inc", mono: "QC", tint: "#ec4899", teu: "3.2K", ship: "390", lane: "KR → US" },
    ],
  },
];

const PHASE_DURATION = {
  typing: 45, // ms per character
  hold_query: 600,
  intent: 700,
  chips: 220, // ms between chips
  hold_chips: 500,
  results_stagger: 90,
  hold_results: 4500,
};

export function HeroSearchDemo({ className = "" }: { className?: string }) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "intent" | "chips" | "results" | "exit">("typing");
  const [chipsShown, setChipsShown] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scene = SCENES[sceneIdx];

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Drive the state machine
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (phase === "typing") {
      if (typed.length < scene.query.length) {
        timer.current = setTimeout(
          () => setTyped(scene.query.slice(0, typed.length + 1)),
          PHASE_DURATION.typing,
        );
      } else {
        timer.current = setTimeout(() => setPhase("intent"), PHASE_DURATION.hold_query);
      }
    } else if (phase === "intent") {
      timer.current = setTimeout(() => {
        setChipsShown(0);
        setPhase("chips");
      }, PHASE_DURATION.intent);
    } else if (phase === "chips") {
      if (chipsShown < scene.chips.length) {
        timer.current = setTimeout(() => setChipsShown((c) => c + 1), PHASE_DURATION.chips);
      } else {
        timer.current = setTimeout(() => setPhase("results"), PHASE_DURATION.hold_chips);
      }
    } else if (phase === "results") {
      timer.current = setTimeout(() => setPhase("exit"), PHASE_DURATION.hold_results);
    } else if (phase === "exit") {
      timer.current = setTimeout(() => {
        setSceneIdx((i) => (i + 1) % SCENES.length);
        setTyped("");
        setChipsShown(0);
        setPhase("typing");
      }, 400);
    }
  }, [phase, typed, chipsShown, scene]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background: "#020617",
        boxShadow: "0 60px 120px -30px rgba(15,23,42,0.45), 0 40px 80px -20px rgba(59,130,246,0.18)",
        border: "1px solid rgba(15,23,42,0.95)",
      }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-dark-3 bg-dark-1 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span className="font-mono ml-3 flex-1 truncate rounded-md border border-dark-3 bg-dark-2 px-2.5 py-1 text-[11px] text-ink-200">
          app.logisticintel.com / pulse
        </span>
      </div>

      <div className="grid grid-rows-[auto_1fr] bg-dark-0 p-4 sm:p-5">
        {/* Search bar */}
        <div className="flex items-center gap-3 rounded-xl border border-dark-3 bg-dark-1 px-3.5 py-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: "rgba(0,240,255,0.12)",
              boxShadow: "0 0 0 1px rgba(0,240,255,0.2)",
            }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "#00F0FF" }} />
          </div>
          <span className="font-body min-h-[20px] flex-1 truncate text-[13px] sm:text-[14px] text-ink-150">
            {typed}
            {phase === "typing" && (
              <span
                className="ml-0.5 inline-block h-3.5 w-[2px] align-middle"
                style={{ background: "#00F0FF", animation: "caret 1s steps(2) infinite" }}
              />
            )}
          </span>
          <button
            className="font-display hidden shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-semibold text-white transition sm:inline-flex"
            style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
          >
            Ask Pulse <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Pulse Coach reads prompt panel */}
        <AnimatePresence mode="wait">
          {(phase === "intent" || phase === "chips" || phase === "results") && (
            <motion.div
              key={`coach-${sceneIdx}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="mt-3 rounded-xl border border-white/10 px-4 py-3"
              style={{
                background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
              }}
            >
              <div
                className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#00F0FF" }}
              >
                Pulse Coach reads your prompt
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="font-display text-[12px] text-ink-150">Reading as</span>
                <span
                  className="font-mono inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{
                    color: "#00F0FF",
                    borderColor: "rgba(0,240,255,0.35)",
                    background: "rgba(0,240,255,0.08)",
                  }}
                >
                  {scene.intent}
                </span>
                <AnimatePresence>
                  {scene.chips.slice(0, chipsShown).map((c) => (
                    <motion.span
                      key={c.label}
                      initial={{ opacity: 0, scale: 0.7, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.28, ease: "backOut" }}
                      className="font-mono inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold"
                      style={chipStyle(c.tone)}
                    >
                      {c.label}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result grid */}
        <AnimatePresence mode="wait">
          {phase === "results" && (
            <motion.div
              key={`results-${sceneIdx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-3"
            >
              <div className="font-display mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-200">
                  Results · {scene.results.length} of 33 from your database
                </span>
                <span className="text-[10.5px] text-ink-200">Live</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {scene.results.map((r, i) => (
                  <motion.div
                    key={r.name}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * (PHASE_DURATION.results_stagger / 1000), duration: 0.32 }}
                    className="rounded-lg border border-dark-3 bg-dark-1 p-2.5 transition-colors hover:border-brand-blue/40"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                        style={{ background: r.tint }}
                      >
                        {r.mono}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-display truncate text-[11.5px] font-semibold text-white">
                          {r.name}
                        </div>
                        <div className="font-mono truncate text-[9.5px] text-ink-200">{r.lane}</div>
                      </div>
                      <BookmarkPlus className="hidden h-3.5 w-3.5 shrink-0 text-ink-200 sm:block" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        className="font-mono text-[12.5px] font-semibold"
                        style={{ color: "#00F0FF" }}
                      >
                        {r.teu}
                      </span>
                      <span className="font-mono text-[9.5px] text-ink-200">TEU 12m</span>
                      <span className="font-mono ml-auto text-[9.5px] text-ink-200">{r.ship} ship</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Static placeholder height during typing/intent so the card doesn't jump */}
        {(phase === "typing" || phase === "exit") && (
          <div className="mt-3 grid grid-cols-2 gap-2 opacity-30 sm:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-dark-3 bg-dark-1 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 shrink-0 rounded-md bg-dark-2" />
                  <div className="min-w-0 flex-1">
                    <div className="h-2.5 w-3/4 rounded bg-dark-2" />
                    <div className="mt-1 h-2 w-1/2 rounded bg-dark-2" />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2.5 w-12 rounded bg-dark-2" />
                  <div className="h-2 w-8 rounded bg-dark-2" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subtle bottom-right "Pulse" badge */}
      <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5">
        <Building2 className="h-3 w-3 text-ink-200/70" />
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-200/70">
          Pulse · live
        </span>
      </div>
    </div>
  );
}

function chipStyle(tone: "industry" | "lane" | "filter"): React.CSSProperties {
  const tones = {
    industry: { color: "#fbbf24", border: "rgba(251,191,36,0.35)", bg: "rgba(251,191,36,0.1)" },
    lane: { color: "#34d399", border: "rgba(52,211,153,0.35)", bg: "rgba(52,211,153,0.1)" },
    filter: { color: "#a78bfa", border: "rgba(167,139,250,0.35)", bg: "rgba(167,139,250,0.1)" },
  };
  const t = tones[tone];
  return { color: t.color, borderColor: t.border, background: t.bg };
}
