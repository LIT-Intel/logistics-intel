import React from "react";
import { Layers, Search, X } from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import type { OutreachTemplate, TemplatesResult } from "../types";

interface Props {
  open: boolean;
  result: TemplatesResult | null;
  onClose: () => void;
  onApply: (template: OutreachTemplate) => void;
}

export function TemplatesDrawer({ open, result, onClose, onApply }: Props) {
  const [query, setQuery] = React.useState("");
  if (!open) return null;

  const rows =
    result?.state === "ok"
      ? result.rows.filter((t) =>
          query
            ? `${t.name} ${t.subject ?? ""} ${t.body ?? ""}`
                .toLowerCase()
                .includes(query.toLowerCase())
            : true,
        )
      : [];

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-[rgba(15,23,42,0.4)]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 left-0 z-40 flex w-full max-w-[480px] flex-col overflow-hidden bg-white shadow-[4px_0_32px_rgba(15,23,42,0.2)]">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-200 px-5 py-4">
          <Layers className="h-4 w-4 text-[#0F172A]" />
          <div>
            <div
              className="text-[15px] font-bold text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              Template Library
            </div>
            <div
              className="text-[11px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              Outbound templates from your workspace
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates"
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-3 text-xs text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
              style={{ fontFamily: fontBody }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!result ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-md bg-slate-100"
                />
              ))}
            </div>
          ) : result.state === "blocked" ? (
            <div
              className="rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-[#B45309]"
              style={{ fontFamily: fontBody }}
            >
              {result.reason}
              <div className="mt-1.5 text-[10px] text-amber-700">
                Configure a SELECT policy on <span style={{ fontFamily: fontMono }}>lit_outreach_templates</span> for the current workspace, or expose a secure read endpoint.
              </div>
            </div>
          ) : result.state === "empty" ? (
            <div className="rounded-md border border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
              <div
                className="text-xs font-semibold text-slate-700"
                style={{ fontFamily: fontDisplay }}
              >
                No templates yet
              </div>
              <div
                className="mt-1 text-[11px] text-slate-500"
                style={{ fontFamily: fontBody }}
              >
                Templates added to <span style={{ fontFamily: fontMono }}>lit_outreach_templates</span> will appear here.
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div
              className="rounded-md border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              No templates match "{query}".
            </div>
          ) : (
            rows.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onApply(tpl)}
                className="mb-2 flex w-full items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-[#3B82F6] hover:bg-[#F0F9FF]"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13px] font-bold text-[#0F172A]"
                    style={{ fontFamily: fontDisplay }}
                  >
                    {tpl.name}
                  </div>
                  <div
                    className="mt-0.5 truncate text-[11px] text-slate-500"
                    style={{ fontFamily: fontBody }}
                  >
                    {tpl.channel || "any channel"}{" "}
                    {tpl.subject ? `· ${tpl.subject}` : ""}
                  </div>
                </div>
                <span
                  className="rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3 py-1 text-[11px] font-semibold text-white"
                  style={{ fontFamily: fontDisplay }}
                >
                  Use
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}