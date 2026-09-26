/**
 * StickyFilterBar — README §5.4. Sticky, blurred, global controls:
 * compact identity (appears past scrollY 260) · period segmented ·
 * metric segmented · active filter tokens · Clear filters · provenance.
 *
 * `view.presets` / `view.metrics` / `view.tokens` carry their own
 * colors + click handlers; rendered verbatim.
 */
import React from "react";
import { ShieldCheck, X } from "lucide-react";
import type { ProfileView } from "../data/selectors";
import type { ProfileExtraActions } from "../data/useProfileState";
import { EASE_OUT, FONT_BODY, FONT_DISPLAY, FONT_MONO, useReducedMotion } from "./ui";

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export interface StickyFilterBarProps {
  view: ProfileView;
  extra: ProfileExtraActions;
  companyName: string;
  mark?: string;
}

export function StickyFilterBar({ view, extra, companyName, mark }: StickyFilterBarProps) {
  const reduced = useReducedMotion();
  const [compact, setCompact] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.scrollY > 260,
  );

  React.useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 260);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const monogram = (mark ?? companyName.slice(0, 4)).toUpperCase();
  const presets: any[] = Array.isArray(view.presets) ? view.presets : [];
  const metrics: any[] = Array.isArray(view.metrics) ? view.metrics : [];
  const tokens: any[] = Array.isArray(view.tokens) ? view.tokens : [];

  return (
    <div
      className="sticky top-0 z-20 border-b border-[#E5E7EB]"
      style={{
        background: "rgba(248,250,252,0.88)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-3 px-8 py-3">
        {/* compact identity — animates in past scrollY 260 */}
        <div
          className="flex items-center gap-[10px] overflow-hidden whitespace-nowrap"
          style={{
            maxWidth: compact ? 420 : 0,
            opacity: compact ? 1 : 0,
            transform: reduced ? undefined : `translateY(${compact ? 0 : 4}px)`,
            transition: reduced
              ? "opacity 200ms"
              : `max-width 300ms ${EASE_OUT}, opacity 200ms, transform 300ms ${EASE_OUT}`,
          }}
          aria-hidden={!compact}
        >
          <div
            className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-[#0F172A] text-[8px] font-bold text-white"
            style={{ fontFamily: FONT_DISPLAY, letterSpacing: "0.04em" }}
          >
            {monogram}
          </div>
          <span className="text-[14px] font-semibold text-[#0F172A]" style={{ fontFamily: FONT_DISPLAY }}>
            {companyName}
          </span>
          <span className="ml-1 h-5 w-px bg-[#E2E8F0]" />
        </div>

        {/* period segmented */}
        <div className="flex gap-[2px] rounded-[10px] border border-[#E5E7EB] bg-white p-[3px]">
          {presets.map((p, i) => (
            <div
              key={p?.id ?? i}
              onClick={p?.onClick}
              className="cursor-pointer whitespace-nowrap rounded-[7px] px-[11px] py-[6px] text-[12px] font-semibold active:scale-[0.97]"
              style={{
                fontFamily: FONT_BODY,
                background: p?.bg,
                color: p?.fg,
                transition: `background 200ms ${EASE_OUT}, color 200ms`,
              }}
            >
              {p?.label}
            </div>
          ))}
        </div>

        {/* metric segmented */}
        <div className="flex gap-[2px] rounded-[10px] bg-[#EEF2F6] p-[3px]">
          {metrics.map((m, i) => (
            <div
              key={m?.id ?? i}
              onClick={m?.onClick}
              className="cursor-pointer rounded-[7px] px-3 py-[6px] text-[12px] font-semibold"
              style={{
                fontFamily: FONT_BODY,
                background: m?.bg,
                color: m?.fg,
                boxShadow: m?.shadow,
                transition: "background 200ms, color 200ms",
              }}
            >
              {m?.label}
            </div>
          ))}
        </div>

        {/* active filter tokens */}
        {tokens.map((t, i) => (
          <div
            key={(t?.dim ?? "") + "-" + (t?.label ?? i)}
            onClick={t?.onRemove}
            className="flex h-[30px] cursor-pointer items-center gap-[6px] rounded-full bg-[#0F172A] pl-[10px] pr-2 text-[12px] font-medium text-white hover:bg-[#1e293b]"
            style={{ fontFamily: FONT_BODY }}
          >
            <span className="text-[#94a3b8]">{t?.dim}</span>
            {t?.label}
            <X size={13} className="text-[#94a3b8]" />
          </div>
        ))}
        {view.hasTokens && (
          <div
            onClick={extra.clearAll}
            className="cursor-pointer text-[12px] font-semibold text-[#3b82f6]"
            style={{ fontFamily: FONT_BODY }}
          >
            Clear filters
          </div>
        )}

        <div className="flex-1" />

        {/* provenance */}
        <div
          className="flex items-center gap-2 text-[12px] font-medium text-[#475569]"
          style={{ fontFamily: FONT_MONO, ...TABULAR }}
        >
          <ShieldCheck size={15} className="text-[#10b981]" />
          <span className="whitespace-nowrap">
            {view.bolsInView} of {view.totalBols} BOLs
          </span>
          <span className="text-[#CBD5E1]">|</span>
          <span className="whitespace-nowrap">{view.periodLabel}</span>
        </div>
      </div>
    </div>
  );
}
