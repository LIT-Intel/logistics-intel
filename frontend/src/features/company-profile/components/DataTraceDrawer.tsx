/**
 * DataTraceDrawer — README §10. The trust mechanism: a 580px right drawer
 * listing the exact BOL rows behind any clicked number, with a scrim,
 * a summary line that must equal the clicked value, and CSV export.
 *
 * Stays mounted for the slide transition; the first mount with the drawer
 * closed never animates (hasOpened guard). Esc-close is handled by
 * useProfileState.
 */
import React from "react";
import { Download, X } from "lucide-react";
import type { ProfileView, TraceRowVM } from "../data/selectors";
import type { ProfileExtraActions } from "../data/useProfileState";
import { EASE_OUT, FONT_BODY, FONT_DISPLAY, FONT_MONO, ModeledPill, Overline } from "./ui";

const DRAWER_EASE = "cubic-bezier(0.32,0.72,0,1)";
const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const CSV_COLS = [
  "id",
  "date",
  "route",
  "carrier",
  "scac",
  "equip",
  "teu",
  "spend",
  "product",
  "supplier",
  "weight",
] as const;

function exportTraceCsv(rows: TraceRowVM[]): void {
  const esc = (v: unknown): string => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [
    CSV_COLS.join(","),
    ...rows.map((r) => CSV_COLS.map((c) => esc(r[c])).join(",")),
  ].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data-trace.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface DataTraceDrawerProps {
  view: ProfileView;
  extra: ProfileExtraActions;
}

export function DataTraceDrawer({ view, extra }: DataTraceDrawerProps) {
  const open = !!view.traceOpen;
  const hasOpened = React.useRef(false);
  if (open && !hasOpened.current) hasOpened.current = true;

  const rows: TraceRowVM[] = Array.isArray(view.traceRows) ? view.traceRows : [];
  const anyModeled = !!(view.modeled?.spend || view.modeled?.teu);

  return (
    <>
      {/* scrim */}
      <div
        onClick={extra.closeTrace}
        aria-hidden
        className="fixed inset-0 z-[900]"
        style={{
          background: "rgba(2,6,23,0.35)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: hasOpened.current ? `opacity 250ms ${EASE_OUT}` : "none",
        }}
      />
      {/* drawer */}
      <aside
        role="dialog"
        aria-modal={open || undefined}
        aria-label="Data trace"
        aria-hidden={!open}
        className="fixed bottom-0 right-0 top-0 z-[901] flex w-[580px] max-w-[100vw] flex-col bg-white"
        style={{
          boxShadow: "-20px 0 40px rgba(15,23,42,0.18)",
          transform: `translateX(${open ? "0%" : "100%"})`,
          transition: hasOpened.current ? `transform 350ms ${DRAWER_EASE}` : "none",
        }}
      >
        <div className="flex justify-between gap-3 border-b border-[#EEF2F6] px-6 pb-4 pt-[22px]">
          <div className="min-w-0">
            <Overline>Data trace · {view.periodLabel}</Overline>
            <div
              className="mt-[6px] text-[22px] font-bold text-[#0F172A]"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              {view.traceTitle}
            </div>
            <div
              className="mt-[6px] flex flex-wrap items-center gap-2 text-[12px] font-medium text-[#1d4ed8]"
              style={{ fontFamily: FONT_MONO, ...TABULAR }}
            >
              {view.traceSum}
              {anyModeled && <ModeledPill label="includes modeled values" />}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close data trace"
            onClick={extra.closeTrace}
            className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-[10px] border border-[#E5E7EB] text-[#475569] hover:bg-[#F1F5F9]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {rows.map((r, i) => (
            <div
              key={r.id + "-" + i}
              className="grid border-b border-[#F1F5F9] px-6 py-3"
              style={{ gridTemplateColumns: "1fr auto", gap: "4px 12px" }}
            >
              <div
                className="flex items-center gap-2 text-[12px] font-medium text-[#1d4ed8]"
                style={{ fontFamily: FONT_MONO, ...TABULAR }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                {r.id}
                <span className="text-[#94a3b8]">{r.date}</span>
              </div>
              <div
                className="text-right text-[12px] font-semibold text-[#0F172A]"
                style={{ fontFamily: FONT_MONO, ...TABULAR }}
              >
                {r.teu} TEU · {r.spend}
              </div>
              <div className="text-[13px] text-[#0F172A]" style={{ fontFamily: FONT_BODY }}>
                {r.route} · {r.carrier}
              </div>
              <div
                className="text-right text-[12px] font-medium text-[#64748b]"
                style={{ fontFamily: FONT_MONO, ...TABULAR }}
              >
                {r.equip}
              </div>
              <div
                className="col-span-2 text-[12px] text-[#64748b]"
                style={{ fontFamily: FONT_BODY }}
              >
                {r.supplier} · {r.product} · {r.weight}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#EEF2F6] px-6 py-[14px]">
          <button
            type="button"
            onClick={() => rows.length && exportTraceCsv(rows)}
            className="flex h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[#0F172A] text-[13px] font-semibold text-white hover:bg-[#1e293b] active:scale-[0.97]"
            style={{
              fontFamily: FONT_BODY,
              transition: `transform 160ms ${EASE_OUT}`,
              opacity: rows.length ? 1 : 0.4,
              pointerEvents: rows.length ? "auto" : "none",
            }}
          >
            <Download size={15} />
            Export these rows (CSV)
          </button>
        </div>
      </aside>
    </>
  );
}
