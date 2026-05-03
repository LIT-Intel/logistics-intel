"use client";

import { useEffect, useState } from "react";

/**
 * Single-pass typewriter — types `text` once over `duration`ms.
 * Triggers when `start` becomes true. No looping; pair with a parent
 * that re-mounts to replay.
 */
export function Typewriter({
  text,
  start,
  cps = 45,
  className = "",
  caret = false,
}: {
  text: string;
  start: boolean;
  cps?: number; // characters-per-second
  className?: string;
  caret?: boolean;
}) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!start) {
      setShown("");
      return;
    }
    let i = 0;
    const interval = 1000 / cps;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, interval);
    return () => clearInterval(id);
  }, [start, text, cps]);

  const done = shown.length >= text.length;
  return (
    <span className={className}>
      {shown}
      {caret && !done && (
        <span
          className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[2px] align-middle"
          style={{ background: "#00F0FF", animation: "caret 1s steps(2) infinite" }}
        />
      )}
    </span>
  );
}
