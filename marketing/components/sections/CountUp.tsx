"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a number up from 0 to `to` over `duration`ms, eased. Triggers
 * on first viewport entry. Pure RAF — no extra deps.
 *
 * Use the `format` prop for "$23.4M", "18.9K", "94%" etc. — pass a
 * function that takes the in-flight numeric value.
 */
export function CountUp({
  to,
  duration = 1200,
  format = (n) => Math.round(n).toLocaleString(),
  className = "",
  start: startProp,
}: {
  to: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  start?: boolean;
}) {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(Boolean(startProp));
  const ref = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof startProp === "boolean") setStarted(startProp);
  }, [startProp]);

  useEffect(() => {
    if (started || typeof startProp === "boolean") return;
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { rootMargin: "-40px" },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [started, startProp]);

  useEffect(() => {
    if (!started) return;
    const startTs = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(eased * to);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [started, to, duration]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
