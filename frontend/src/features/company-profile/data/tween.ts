/**
 * tween — count-up driver for KPI / narrative numbers (port of the handoff's
 * tween()). Ease-out quart over `ms`, calling `onFrame` with interpolated
 * values. Returns a cancel function.
 *
 * Reduced-motion: pass `instant: true` to jump straight to the target
 * (README §11 — disable count-up, keep final values).
 */
export function tween(
  from: Record<string, number> | null | undefined,
  to: Record<string, number>,
  ms: number,
  onFrame: (o: Record<string, number>) => void,
  instant = false,
): () => void {
  if (instant || typeof requestAnimationFrame === "undefined") {
    onFrame({ ...to });
    return () => {};
  }
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - p, 4);
    const o: Record<string, number> = {};
    for (const k in to) {
      const a = from && from[k] != null ? from[k] : 0;
      o[k] = a + (to[k] - a) * e;
    }
    onFrame(o);
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
