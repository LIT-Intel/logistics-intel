import React, { useMemo, useState } from "react";
import { Layers, Search, X } from "lucide-react";
import { fontDisplay, fontBody } from "../tokens";
import type { OutreachTemplate } from "../types";
import type { TemplatesState } from "../hooks/useTemplates";
import type { StarterTemplate } from "../data/templates";

interface Props {
  open: boolean;
  state: TemplatesState | null;
  onClose: () => void;
  onApply: (template: OutreachTemplate) => void;
}

const INDUSTRY_LABEL: Record<string, string> = {
  any: "Cross-industry",
  automotive: "Automotive",
  electronics: "Electronics",
  solar: "Solar",
  data_centers: "Data centers",
  manufacturing: "Manufacturing",
  apparel: "Apparel",
  pharma: "Pharma",
  food_beverage: "Food & Bev",
  chemicals: "Chemicals",
  cpg: "CPG",
};

const INTENT_LABEL: Record<string, string> = {
  opener: "Opener",
  bump: "Follow-up",
  breakup: "Breakup",
};

function isStarter(t: OutreachTemplate): t is OutreachTemplate & StarterTemplate {
  return Object.prototype.hasOwnProperty.call(t, "industry");
}

export function TemplatesDrawer({ open, state, onClose, onApply }: Props) {
  const [query, setQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  if (!open) return null;

  const rows = state?.result.state === "ok" ? state.result.rows : [];

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const t of rows) {
      if (isStarter(t)) set.add(t.industry);
    }
    return ["all", ...Array.from(set)];
  }, [rows]);

  const filtered = rows.filter((t) => {
    if (
      industryFilter !== "all" &&
      isStarter(t) &&
      t.industry !== industryFilter
    ) {
      return false;
    }
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return `${t.name} ${t.subject ?? ""} ${t.body ?? ""}`
      .toLowerCase()
      .includes(q);
  });

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-[rgba(15,23,42,0.4)]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 left-0 z-40 flex w-full max-w-[480px] flex-col overflow-hidden bg-white shadow-[4px_0_32px_rgba(15,23,42,0.2)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-2.5">
          <Layers className="h-3.5 w-3.5 text-[#0F172A]" />
          <div>
            <div
              className="text-[13px] font-bold text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              Template library
            </div>
            <div
              className="text-[11px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              {state?.source === "db"
                ? "From your workspace"
                : "Curated starter templates"}
              {filtered.length > 0
                ? ` · ${filtered.length} of ${rows.length}`
                : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {state?.blockedReason ? (
          <div
            className="border-b border-amber-200 bg-amber-50/60 px-4 py-2 text-[11px] text-[#B45309]"
            style={{ fontFamily: fontBody }}
          >
            {state.blockedReason}
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates"
              className="w-full rounded-md border border-slate-200 bg-white py-1 pl-6 pr-2 text-[12px] text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
              style={{ fontFamily: fontBody }}
            />
          </div>
        </div>

        {industries.length > 1 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-100 px-4 py-2">
            {industries.map((ind) => {
              const active = industryFilter === ind;
              return (
                <button
                  key={ind}
                  type="button"
                  onClick={() => setIndustryFilter(ind)}
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition"
                  style={{
                    background: active ? "#0F172A" : "#F1F5F9",
                    color: active ? "#fff" : "#475569",
                    border: `1px solid ${active ? "#0F172A" : "#E2E8F0"}`,
                    fontFamily: fontDisplay,
                  }}
                >
                  {ind === "all" ? "All" : INDUSTRY_LABEL[ind] ?? ind}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {!state ? (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-md bg-slate-100"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[12px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              No templates match.
            </div>
          ) : (
            filtered.map((tpl) => {
              const starter = isStarter(tpl) ? (tpl as StarterTemplate) : null;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onApply(tpl)}
                  className="mb-1.5 flex w-full flex-col gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-[#3B82F6] hover:bg-[#F0F9FF]"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="text-[12.5px] font-bold text-[#0F172A]"
                      style={{ fontFamily: fontDisplay }}
                    >
                      {tpl.name}
                    </span>
                    {starter ? (
                      <>
                        <Tag tone="slate">
                          {INDUSTRY_LABEL[starter.industry] ?? starter.industry}
                        </Tag>
                        <Tag
                          tone={
                            starter.intent === "opener"
                              ? "blue"
                              : starter.intent === "bump"
                              ? "violet"
                              : "amber"
                          }
                        >
                          {INTENT_LABEL[starter.intent] ?? starter.intent}
                        </Tag>
                      </>
                    ) : null}
                    <span
                      className="ml-auto rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-2.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ fontFamily: fontDisplay }}
                    >
                      Use
                    </span>
                  </div>
                  {tpl.subject ? (
                    <div
                      className="truncate text-[11px] text-slate-700"
                      style={{ fontFamily: fontBody }}
                    >
                      {tpl.subject}
                    </div>
                  ) : null}
                  {starter?.hook ? (
                    <div
                      className="text-[11px] leading-relaxed text-slate-500"
                      style={{ fontFamily: fontBody }}
                    >
                      {starter.hook}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: "slate" | "blue" | "violet" | "amber";
  children: React.ReactNode;
}) {
  const map = {
    slate: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
    blue: { bg: "#EFF6FF", color: "#1d4ed8", border: "#BFDBFE" },
    violet: { bg: "#F5F3FF", color: "#6d28d9", border: "#DDD6FE" },
    amber: { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  }[tone];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em]"
      style={{
        background: map.bg,
        color: map.color,
        border: `1px solid ${map.border}`,
        fontFamily: fontDisplay,
      }}
    >
      {children}
    </span>
  );
}