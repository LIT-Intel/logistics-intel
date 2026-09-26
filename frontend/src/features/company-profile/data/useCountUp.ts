/**
 * useCountUp — drives the KPI / narrative count-up numbers (README §11).
 * Tweens from the previously displayed values to `targets` over ~650ms with
 * ease-out quart; respects prefers-reduced-motion by jumping to the target.
 */
import { useEffect, useRef, useState } from "react";
import { tween } from "./tween";

export function useCountUp(
  targets: Record<string, number> | null | undefined,
  ms = 650,
): Record<string, number> | null {
  const [disp, setDisp] = useState<Record<string, number> | null>(null);
  const lastRef = useRef<Record<string, number> | null>(null);
  const key = targets ? JSON.stringify(targets) : "";

  useEffect(() => {
    if (!targets) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return tween(
      lastRef.current,
      targets,
      ms,
      (o) => { lastRef.current = o; setDisp(o); },
      reduced,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);

  return disp;
}
