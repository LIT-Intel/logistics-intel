/**
 * Lane History tab — handoff README §8, markup ported from the
 * `<sc-if value="{{ isHistory }}">` block of "Company Profile v2.dc.html".
 *
 * Renders `computeView()` (heat/hmMonths) + `computeLanes()` (stackBars,
 * life, events, lifeYears) verbatim — items carry their own handlers and
 * precomputed colors/heights/opacities; this file never re-derives math.
 */
import React from "react";
import { Flag, Pause, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LanesView, ProfileView } from "../../data/selectors";
import { Card, EASE_OUT, FONT_BODY, FONT_DISPLAY, FONT_MONO, Overline, useReducedMotion } from "../ui";

const EVENT_ICONS: Record<string, LucideIcon> = {
  flag: Flag,
  "trending-up": TrendingUp,
  pause: Pause,
};

export function LaneHistoryTab({
  view,
  lanesView,
  firstMonthLabel,
}: {
  view: ProfileView;
  lanesView: LanesView;
  firstMonthLabel: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-col gap-5">
      {/* a) title block */}
      <div className="pb-1 pt-2">
        <h2
          className="m-0 text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-[#0F172A]"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Lane history
        </h2>
        <p
          className="mb-0 mt-[10px] max-w-[820px] text-[17px] leading-[1.55] text-[#475569]"
          style={{ fontFamily: FONT_BODY, textWrap: "pretty" } as React.CSSProperties}
        >
          Month-by-month volume for every lane, built from the full bill of lading archive ({view.totalBols} BOLs
          since {firstMonthLabel}). Drag the history bar above to change the window.
        </p>
      </div>

      {/* b) stacked monthly chart */}
      <Card className="px-6 py-5">
        <div className="flex flex-wrap justify-between gap-4">
          <Overline>
            {view.unitM} per month, stacked by lane · {view.periodLabel}
          </Overline>
          <div className="flex flex-wrap gap-3 text-[12px] text-[#475569]">
            {lanesView.lanesD.map((l) => (
              <span
                key={l.key}
                onClick={l.onClick}
                className="flex cursor-pointer items-center gap-[6px]"
                style={{ opacity: l.opacity }}
              >
                <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="relative mt-5 flex h-[240px] items-end gap-[5px] border-b border-[#E2E8F0]">
          <div className="absolute left-0 right-0 top-0 border-t border-dashed border-[#EEF2F6]">
            <span
              className="absolute right-0 top-[-16px] text-[10px] text-[#94a3b8] [font-variant-numeric:tabular-nums]"
              style={{ fontFamily: FONT_MONO }}
            >
              {lanesView.stackMax}
            </span>
          </div>
          {lanesView.stackBars.map((b) => (
            <div
              key={b.mi}
              title={b.title}
              onClick={b.onClick}
              className="flex h-full flex-1 cursor-pointer items-end hover:opacity-85"
            >
              <div
                className="flex h-full w-full flex-col-reverse gap-[1px] overflow-hidden rounded-t-[4px]"
                style={{
                  transform: `scaleY(${b.s})`,
                  transformOrigin: "bottom",
                  ...(reduced
                    ? null
                    : { transition: `transform 560ms ${EASE_OUT}`, transitionDelay: `${b.delay}ms` }),
                }}
              >
                {b.segs.map((g, i) => (
                  <div key={i} className="flex-none" style={{ height: g.h, background: g.color }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-[5px]">
          {lanesView.stackBars.map((b) => (
            <div
              key={b.mi}
              className="flex-1 text-center text-[11px] font-medium text-[#94a3b8] [font-variant-numeric:tabular-nums]"
              style={{ fontFamily: FONT_MONO }}
            >
              {b.label}
            </div>
          ))}
        </div>
      </Card>

      {/* c) lane lifecycle */}
      <Card className="overflow-x-auto px-6 py-5">
        <div className="flex flex-wrap justify-between gap-3">
          <Overline>Lane lifecycle · {firstMonthLabel} → today</Overline>
          <div className="text-[12px] text-[#94a3b8]">
            Outlined months are in the selected window. Click a month for its BOLs.
          </div>
        </div>
        <div className="mt-[18px] min-w-[880px]">
          <div
            className="grid gap-[14px] pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8] [grid-template-columns:150px_minmax(0,1fr)_96px_70px_70px]"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            <span>Lane</span>
            <span className="flex">
              {lanesView.lifeYears.map((y) => (
                <span key={y.label} className="border-l border-[#E2E8F0] pl-[5px]" style={{ width: y.w }}>
                  {y.label}
                </span>
              ))}
            </span>
            <span>First seen</span>
            <span>Active</span>
            <span>Streak</span>
          </div>
          {lanesView.life.map((l) => (
            <div
              key={l.key}
              className="grid items-center gap-[14px] border-t border-[#F1F5F9] py-2 [grid-template-columns:150px_minmax(0,1fr)_96px_70px_70px]"
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ fontFamily: FONT_BODY }}>
                <span className="h-2 w-2 rounded-[2px]" style={{ background: l.color }} />
                {l.label}
              </span>
              <div className="flex gap-[2px]">
                {l.cells.map((c: any, i: number) => (
                  <div
                    key={i}
                    title={c.title}
                    onClick={c.onClick}
                    className="h-[22px] flex-1 cursor-pointer rounded-[3px] hover:[transform:scaleY(1.15)]"
                    style={{
                      background: c.bg,
                      opacity: c.op,
                      boxShadow: `inset 0 0 0 1px ${c.outline}`,
                      transition: "opacity 300ms, box-shadow 200ms",
                    }}
                  />
                ))}
              </div>
              <span
                className="text-[11px] font-medium text-[#475569] [font-variant-numeric:tabular-nums]"
                style={{ fontFamily: FONT_MONO }}
              >
                {l.first}
              </span>
              <span
                className="text-[12px] font-semibold [font-variant-numeric:tabular-nums]"
                style={{ fontFamily: FONT_MONO }}
              >
                {l.months} mo
              </span>
              <span
                className="text-[12px] font-semibold [font-variant-numeric:tabular-nums]"
                style={{ fontFamily: FONT_MONO }}
              >
                {l.streak}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* d) heatmap + events */}
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
        {/* Lane × month heatmap */}
        <Card className="min-w-0 overflow-x-auto px-6 py-5">
          <Overline>Lane × month · {view.unitM}</Overline>
          <div className="mt-4 min-w-[520px]">
            <div className="mb-1 ml-[130px] flex gap-[3px]">
              {view.hmMonths.map((m: any) => (
                <div
                  key={m.mi}
                  className="flex-1 text-center text-[10px] font-medium text-[#94a3b8] [font-variant-numeric:tabular-nums]"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {m.label}
                </div>
              ))}
            </div>
            {view.heat.map((row: any) => (
              <div key={row.label} className="mb-[3px] flex items-center gap-[3px]">
                <div
                  className="flex w-[127px] items-center gap-[7px] text-[12px] font-semibold"
                  style={{ fontFamily: FONT_BODY }}
                >
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: row.color }} />
                  {row.label}
                </div>
                {row.cells.map((c: any, i: number) => (
                  <div
                    key={i}
                    title={c.title}
                    onClick={c.onClick}
                    className="grid h-[32px] flex-1 cursor-pointer place-items-center rounded-[5px] text-[10px] font-semibold hover:scale-[1.06] [font-variant-numeric:tabular-nums]"
                    style={{
                      fontFamily: FONT_MONO,
                      background: c.bg,
                      color: c.fg,
                      transition: `background 300ms ${EASE_OUT}, transform 120ms`,
                    }}
                  >
                    {c.v}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>

        {/* Lane events */}
        <Card className="min-w-0 px-6 py-5">
          <Overline>Lane events</Overline>
          <div className="mt-[14px] flex flex-col">
            {lanesView.events.slice(0, 10).map((e: any, i: number) => {
              const Icon = EVENT_ICONS[e.icon] ?? Flag;
              return (
                <div
                  key={i}
                  className="grid items-start gap-3 border-b border-[#F1F5F9] py-[10px] [grid-template-columns:28px_minmax(0,1fr)_auto]"
                >
                  <span className="grid h-[28px] w-[28px] place-items-center rounded-[8px] border border-[#EEF2F6] bg-[#F8FAFC]">
                    <Icon size={14} style={{ color: e.color }} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold" style={{ fontFamily: FONT_BODY }}>
                      {e.title}
                    </div>
                    <div className="mt-[2px] text-[12px] text-[#64748b]">{e.body}</div>
                  </div>
                  <span
                    className="whitespace-nowrap text-right text-[11px] font-medium text-[#94a3b8] [font-variant-numeric:tabular-nums]"
                    style={{ fontFamily: FONT_MONO }}
                  >
                    {e.date}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
