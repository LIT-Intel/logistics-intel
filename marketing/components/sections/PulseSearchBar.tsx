"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const QUERIES = [
  { text: "Find furniture importers shipping from Vietnam", tags: "Trade · Industry" },
  { text: "Show me wire harness importers that switched carriers", tags: "Carrier · Pivot" },
  { text: "EV battery shippers landing in Long Beach this quarter", tags: "Lane · HS Code" },
  { text: "Cold chain importers with volume up 25% MoM", tags: "Trend · Industry" },
  { text: "Apparel shippers moving from China to Mexico", tags: "Reshoring · Lane" },
];

const TYPING_DELAY = 45;
const HOLD_DELAY = 2200;
const ERASE_DELAY = 25;

/**
 * Auto-typing Pulse search bar used in the homepage hero + /pulse page.
 * Cycles through a curated set of queries to communicate that Pulse
 * understands intent — not just keywords. Pure CSS + minimal state.
 */
export function PulseSearchBar({ className = "" }: { className?: string }) {
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState("");
  const [phase, setPhase] = useState<"typing" | "hold" | "erasing">("typing");

  const current = QUERIES[idx % QUERIES.length];

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (shown.length < current.text.length) {
        t = setTimeout(() => setShown(current.text.slice(0, shown.length + 1)), TYPING_DELAY);
      } else {
        t = setTimeout(() => setPhase("hold"), HOLD_DELAY);
      }
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("erasing"), 0);
    } else {
      if (shown.length > 0) {
        t = setTimeout(() => setShown(shown.slice(0, -1)), ERASE_DELAY);
      } else {
        t = setTimeout(() => {
          setIdx((i) => (i + 1) % QUERIES.length);
          setPhase("typing");
        }, 200);
      }
    }
    return () => clearTimeout(t);
  }, [shown, phase, current.text]);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-dark-3 bg-dark-1 px-4 py-3 ${className}`}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: "rgba(0,240,255,0.12)",
          boxShadow: "0 0 0 1px rgba(0,240,255,0.2)",
        }}
      >
        <Sparkles className="h-4 w-4" style={{ color: "#00F0FF" }} />
      </div>
      <span className="font-body min-h-[20px] flex-1 text-[14px] text-ink-150">
        {shown || " "}
        <span
          className="ml-0.5 inline-block h-[14px] w-[2px] align-middle"
          style={{ background: "#00F0FF", animation: "caret 1s steps(2) infinite" }}
        />
      </span>
      <span
        className="font-mono hidden shrink-0 items-center rounded border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline-flex"
        style={{
          color: "#00F0FF",
          borderColor: "rgba(0,240,255,0.35)",
          background: "rgba(0,240,255,0.08)",
        }}
      >
        {current.tags}
      </span>
    </div>
  );
}
