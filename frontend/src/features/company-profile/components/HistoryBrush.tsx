/**
 * HistoryBrush — README §5.5. Full-history month strip with a drag brush,
 * animated selection overlay, touch (pointer events) and keyboard support
 * (←/→ move the window, Shift+←/→ resizes m1), plus year labels.
 *
 * Bars come precomputed from `view.timeline` (bg / scaleY / handlers);
 * the overlay geometry comes from `view.brush`. Keyboard moves call
 * `actions.range` directly and suppress the CSS transition (§11: never
 * animate on keyboard-driven brush moves).
 */
import React from "react";
import type { ProfileView } from "../data/selectors";
import type { ProfileActions } from "../data/types";
import type { ProfileExtraActions } from "../data/useProfileState";
import { Card, EASE_OUT, FONT_MONO, Overline, useReducedMotion } from "./ui";

export interface HistoryBrushProps {
  view: ProfileView;
  extra: ProfileExtraActions;
  actions: ProfileActions;
  m0: number;
  m1: number;
}

export function HistoryBrush({ view, extra, actions, m0, m1 }: HistoryBrushProps) {
  const reduced = useReducedMotion();
  const [kbNav, setKbNav] = React.useState(false);
  const kbTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (kbTimer.current) clearTimeout(kbTimer.current);
    },
    [],
  );

  const timeline: any[] = Array.isArray(view.timeline) ? view.timeline : [];
  const years: any[] = Array.isArray(view.years) ? view.years : [];
  const N = timeline.length;
  if (!N) return null;

  const clamp = (v: number) => Math.max(0, Math.min(N - 1, v));

  const markKbNav = () => {
    setKbNav(true);
    if (kbTimer.current) clearTimeout(kbTimer.current);
    kbTimer.current = setTimeout(() => setKbNav(false), 250);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    markKbNav();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    if (e.shiftKey) {
      // resize: move m1, never below m0
      const next = clamp(m1 + dir);
      if (next >= m0 && next !== m1) actions.range(m0, next);
    } else {
      // move the whole window, clamped to [0, N-1]
      const a = clamp(m0 + dir);
      const b = clamp(m1 + dir);
      if (b - a === m1 - m0 && (a !== m0 || b !== m1)) actions.range(a, b);
    }
  };

  const windowLabel = (mi: number): string => {
    const raw = timeline[mi]?.label;
    return typeof raw === "string" ? raw.split(" · ")[0] : String(mi);
  };

  const noAnim = reduced || kbNav;

  return (
    <Card style={{ padding: "16px 20px 12px" }}>
      <div className="mb-[10px] flex items-baseline justify-between gap-3">
        <Overline>Shipment history · {view.unitM} per month</Overline>
        <div className="text-[12px] text-[#94a3b8]">Drag across months to set the window</div>
      </div>

      <div className="relative select-none">
        {/* selection overlay */}
        <div
          className="pointer-events-none absolute rounded-[6px]"
          data-kb-nav={kbNav || undefined}
          style={{
            top: -4,
            bottom: -4,
            left: view.brush?.left,
            width: view.brush?.width,
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.35)",
            transition: noAnim ? "none" : `left 200ms ${EASE_OUT}, width 200ms ${EASE_OUT}`,
          }}
        />
        {/* month strip */}
        <div
          role="slider"
          aria-label="Shipment history window"
          aria-valuemin={0}
          aria-valuemax={N - 1}
          aria-valuenow={m0}
          aria-valuetext={`${windowLabel(m0)} to ${windowLabel(m1)}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerUp={extra.endBrush}
          onPointerCancel={extra.endBrush}
          onMouseUp={extra.endBrush}
          className="relative flex h-14 items-end gap-[2px] outline-offset-4"
          style={{ touchAction: "none" }}
        >
          {timeline.map((b, i) => (
            <div
              key={b?.mi ?? i}
              title={b?.label}
              onPointerDown={(e) => {
                // release implicit capture so pointerenter fires on siblings during touch drags
                try {
                  (e.target as Element).releasePointerCapture?.(e.pointerId);
                } catch {
                  /* noop */
                }
                b?.onDown?.(e);
              }}
              onPointerEnter={() => b?.onEnter?.()}
              onMouseDown={(e) => b?.onDown?.(e)}
              onMouseEnter={() => b?.onEnter?.()}
              className="flex h-full flex-1 cursor-ew-resize items-end"
            >
              <div
                className="h-full w-full"
                style={{
                  borderRadius: "3px 3px 1px 1px",
                  background: b?.bg,
                  transform: `scaleY(${b?.s ?? 0})`,
                  transformOrigin: "bottom",
                  transition: reduced ? "background 200ms" : `transform 500ms ${EASE_OUT}, background 200ms`,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* year labels */}
      <div className="relative mt-[6px] h-[18px]">
        {years.map((y, i) => (
          <div
            key={y?.label ?? i}
            className="absolute top-0 border-l border-[#E2E8F0] pl-[6px] text-[11px] font-medium text-[#94a3b8]"
            style={{ left: y?.left, width: y?.width, fontFamily: FONT_MONO }}
          >
            {y?.label}
          </div>
        ))}
      </div>
    </Card>
  );
}
