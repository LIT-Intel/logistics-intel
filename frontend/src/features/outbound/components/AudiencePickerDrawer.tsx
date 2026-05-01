import React, { useMemo, useState } from "react";
import { ArrowRight, Check, Search, Users, X } from "lucide-react";
import { fontDisplay, fontBody } from "../tokens";
import type { SavedCompanyLite } from "../hooks/useSavedCompanies";

interface Props {
  open: boolean;
  loading: boolean;
  companies: SavedCompanyLite[];
  selectedIds: Set<string>;
  onClose: () => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onOpenCommandCenter: () => void;
}

export function AudiencePickerDrawer({
  open,
  loading,
  companies,
  selectedIds,
  onClose,
  onToggle,
  onSelectAll,
  onClearAll,
  onOpenCommandCenter,
}: Props) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    if (!filter.trim()) return companies;
    const q = filter.trim().toLowerCase();
    return companies.filter((c) =>
      `${c.name} ${c.domain ?? ""} ${c.location ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [companies, filter]);

  if (!open) return null;
  const selectedCount = selectedIds.size;

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-[rgba(15,23,42,0.4)]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col overflow-hidden bg-white shadow-[-4px_0_32px_rgba(15,23,42,0.2)]">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-200 px-5 py-4">
          <Users className="h-4 w-4 text-[#0F172A]" />
          <div>
            <div
              className="text-[15px] font-bold text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              Pick recipients
            </div>
            <div
              className="text-[11px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              From your saved companies in Command Center
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

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name, domain, or location"
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-3 text-xs text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
              style={{ fontFamily: fontBody }}
            />
          </div>
          <span
            className="rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#1d4ed8]"
            style={{ fontFamily: fontDisplay }}
          >
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={!filtered.length}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            style={{ fontFamily: fontDisplay }}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={selectedCount === 0}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            style={{ fontFamily: fontDisplay }}
          >
            Clear
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-md bg-slate-100"
                />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
              <div
                className="text-xs font-semibold text-[#0F172A]"
                style={{ fontFamily: fontDisplay }}
              >
                No saved companies yet
              </div>
              <div
                className="mt-1 text-[11px] text-slate-500"
                style={{ fontFamily: fontBody }}
              >
                Save shippers in Command Center first — they'll appear here as your audience.
              </div>
              <button
                type="button"
                onClick={onOpenCommandCenter}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                style={{ fontFamily: fontDisplay }}
              >
                Open Command Center
                <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              No companies match "{filter}".
            </div>
          ) : (
            filtered.map((c) => {
              const checked = c.company_id ? selectedIds.has(c.company_id) : false;
              return (
                <button
                  key={c.saved_id ?? c.company_id ?? c.name}
                  type="button"
                  onClick={() => c.company_id && onToggle(c.company_id)}
                  disabled={!c.company_id}
                  className="mb-2 flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left transition"
                  style={{
                    background: checked ? "#EFF6FF" : "#fff",
                    borderColor: checked ? "#BFDBFE" : "#E5E7EB",
                  }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                    style={{
                      background: checked ? "#3B82F6" : "#fff",
                      borderColor: checked ? "#3B82F6" : "#CBD5E1",
                      color: "#fff",
                    }}
                  >
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-xs font-semibold text-[#0F172A]"
                      style={{ fontFamily: fontDisplay }}
                    >
                      {c.name}
                    </div>
                    <div
                      className="truncate text-[11px] text-slate-500"
                      style={{ fontFamily: fontBody }}
                    >
                      {[c.domain, c.location, c.stage]
                        .filter(Boolean)
                        .join(" · ") || "No metadata yet"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <span
            className="text-[11px] text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            {selectedCount} of {companies.length} selected
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
            style={{ fontFamily: fontDisplay }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}