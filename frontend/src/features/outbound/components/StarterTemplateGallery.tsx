// StarterTemplateGallery — modal that opens from the email composer's
// "Templates" button. Shows the six branded starter templates with hero
// thumbnails, copy descriptions, and a "Use template" action that loads
// the template's subject + body HTML into the composer.

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { fontDisplay, fontBody } from "@/features/outbound/tokens";
import { STARTER_TEMPLATES } from "@/features/outbound/data/starterTemplates";
import type { StarterTemplate } from "@/features/outbound/data/starterTemplates";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (template: StarterTemplate) => void;
}

export default function StarterTemplateGallery({ open, onClose, onPick }: Props) {
  const [filter, setFilter] = useState<string>("all");
  if (!open) return null;

  const sectors = Array.from(new Set(STARTER_TEMPLATES.map((t) => t.sector)));
  const filtered =
    filter === "all" ? STARTER_TEMPLATES : STARTER_TEMPLATES.filter((t) => t.sector === filter);

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-slate-950/60" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-[91] flex h-[88vh] w-[min(1200px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.4)]"
        role="dialog"
        aria-label="Starter templates"
      >
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-purple-500 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-[15px] font-bold text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              Starter Templates
            </div>
            <div
              className="text-[12px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              Branded HTML emails ready to ship. Pick one and edit freely in the composer.
            </div>
          </div>
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-[4px] px-2.5 py-1 font-semibold ${
                filter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
              style={{ fontFamily: fontDisplay }}
            >
              All
            </button>
            {sectors.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-[4px] px-2.5 py-1 font-semibold capitalize ${
                  filter === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
                style={{ fontFamily: fontDisplay }}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto bg-[#F8FAFC] p-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <article
              key={t.key}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div
                className="aspect-[600/220] w-full bg-slate-100"
                dangerouslySetInnerHTML={{ __html: extractHero(t.body_html) }}
                style={{ overflow: "hidden" }}
              />
              <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
                <div
                  className="text-[14px] font-bold text-[#0F172A]"
                  style={{ fontFamily: fontDisplay }}
                >
                  {t.name}
                </div>
                <div
                  className="text-[11.5px] leading-relaxed text-slate-600"
                  style={{ fontFamily: fontBody }}
                >
                  {t.description}
                </div>
                <div
                  className="mt-1 truncate rounded-md bg-slate-50 px-2 py-1 text-[10.5px] text-slate-700"
                  style={{ fontFamily: fontBody }}
                  title={t.subject}
                >
                  Subject: {t.subject}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <span
                    className="rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]"
                    style={{
                      fontFamily: fontDisplay,
                      borderColor: t.accent + "55",
                      color: t.accent,
                      background: t.accent + "10",
                    }}
                  >
                    {t.sector}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPick(t)}
                    className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
                    style={{ fontFamily: fontDisplay }}
                  >
                    Use template
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

// Pull the first <svg>...</svg> block out of the body HTML so we can
// render it as a thumbnail without having to ship a separate hero map.
function extractHero(bodyHtml: string): string {
  const m = bodyHtml.match(/<svg[\s\S]*?<\/svg>/);
  return m ? m[0] : "";
}
