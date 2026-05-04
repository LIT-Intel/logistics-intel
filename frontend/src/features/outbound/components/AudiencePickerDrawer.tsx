import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Mail, Plus, Search, Users, X, AlertCircle, UserCheck } from "lucide-react";
import { fontDisplay, fontBody, fontMono } from "../tokens";
import { supabase } from "@/lib/supabase";
import type { SavedCompanyLite } from "../hooks/useSavedCompanies";

export type ManualRecipient = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
};

interface Props {
  open: boolean;
  loading: boolean;
  companies: SavedCompanyLite[];
  selectedIds: Set<string>;
  manualEmails: ManualRecipient[];
  onClose: () => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onChangeManualEmails: (next: ManualRecipient[]) => void;
  onOpenCommandCenter: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Parse a textarea blob: one email per line, OR comma-separated. Each
// entry can optionally be `Name <email@domain>` or `email@domain, First, Last, Company`.
// Keeps it forgiving: anything that pulls out a valid email becomes a row.
function parseManualEmails(blob: string): ManualRecipient[] {
  const out = new Map<string, ManualRecipient>();
  const lines = blob.split(/[\n;]/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    // Pattern: First Last <email>
    const angle = line.match(/^(.+?)\s*<\s*([^>]+@[^\s>]+)\s*>$/);
    if (angle) {
      const email = angle[2].trim().toLowerCase();
      if (!EMAIL_RE.test(email)) continue;
      const [first, ...rest] = angle[1].trim().split(/\s+/);
      out.set(email, {
        email,
        first_name: first || undefined,
        last_name: rest.length ? rest.join(" ") : undefined,
      });
      continue;
    }
    // Pattern: email, First, Last, Company  (CSV-ish)
    const parts = line.split(",").map((p) => p.trim());
    const email = (parts[0] || "").toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    out.set(email, {
      email,
      first_name: parts[1] || undefined,
      last_name: parts[2] || undefined,
      company_name: parts[3] || undefined,
    });
  }
  return [...out.values()];
}

function formatManualBlob(list: ManualRecipient[]): string {
  return list
    .map((m) => {
      const fields = [m.email, m.first_name ?? "", m.last_name ?? "", m.company_name ?? ""]
        .map((s) => s.trim())
        .filter((s, i) => s !== "" || i === 0);
      return fields.join(", ");
    })
    .join("\n");
}

export function AudiencePickerDrawer({
  open,
  loading,
  companies,
  selectedIds,
  manualEmails,
  onClose,
  onToggle,
  onSelectAll,
  onClearAll,
  onChangeManualEmails,
  onOpenCommandCenter,
}: Props) {
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"companies" | "manual">("companies");
  const [manualBlob, setManualBlob] = useState<string>("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [enrichedCounts, setEnrichedCounts] = useState<Record<string, number>>({});

  // Sync manual blob with parent state when drawer opens.
  useEffect(() => {
    if (!open) return;
    setManualBlob(formatManualBlob(manualEmails));
    setManualError(null);
  }, [open, manualEmails]);

  // Pull enriched contact counts for the visible companies in one query
  // when the drawer opens. Counts populate the per-row "N with email"
  // badge so the user can see at a glance which companies are
  // actually launchable without manual entry.
  useEffect(() => {
    if (!open) return;
    const ids = companies.map((c) => c.company_id).filter(Boolean) as string[];
    if (ids.length === 0) {
      setEnrichedCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("lit_contacts")
        .select("company_id")
        .in("company_id", ids)
        .not("email", "is", null);
      if (cancelled) return;
      if (error) {
        setEnrichedCounts({});
        return;
      }
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ company_id: string }>) {
        if (!row.company_id) continue;
        counts[row.company_id] = (counts[row.company_id] || 0) + 1;
      }
      setEnrichedCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companies]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return companies;
    const q = filter.trim().toLowerCase();
    return companies.filter((c) =>
      `${c.name} ${c.domain ?? ""} ${c.location ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [companies, filter]);

  // Total enriched contacts across CURRENTLY-SELECTED companies — the
  // number the dispatcher will actually email out of from the company side.
  const enrichedSelectedCount = useMemo(() => {
    let n = 0;
    for (const id of selectedIds) {
      n += enrichedCounts[id] ?? 0;
    }
    return n;
  }, [selectedIds, enrichedCounts]);

  if (!open) return null;
  const selectedCount = selectedIds.size;
  const totalManual = manualEmails.length;
  const totalEmailable = enrichedSelectedCount + totalManual;

  function handleManualBlur() {
    const parsed = parseManualEmails(manualBlob);
    onChangeManualEmails(parsed);
    setManualError(null);
  }

  function handleAddSingle() {
    const trimmed = manualBlob.trim();
    if (!trimmed) return;
    const parsed = parseManualEmails(trimmed);
    if (parsed.length === 0) {
      setManualError("No valid emails found. Use one per line.");
      return;
    }
    // Merge with existing.
    const merged = new Map<string, ManualRecipient>();
    for (const m of [...manualEmails, ...parsed]) merged.set(m.email, m);
    onChangeManualEmails([...merged.values()]);
    setManualBlob("");
    setManualError(null);
  }

  function handleRemoveManual(email: string) {
    onChangeManualEmails(manualEmails.filter((m) => m.email !== email));
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-[rgba(15,23,42,0.4)]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[560px] flex-col overflow-hidden bg-white shadow-[-4px_0_32px_rgba(15,23,42,0.2)]">
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
              Saved companies (only enriched contacts get emailed) plus any manual emails you add.
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

        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50 px-5">
          <TabButton active={tab === "companies"} onClick={() => setTab("companies")}>
            <Users className="h-3 w-3" />
            From saved companies
            <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-bold text-blue-700">
              {selectedCount}
            </span>
          </TabButton>
          <TabButton active={tab === "manual"} onClick={() => setTab("manual")}>
            <Mail className="h-3 w-3" />
            Manual emails
            <span className="ml-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9.5px] font-bold text-purple-700">
              {totalManual}
            </span>
          </TabButton>
        </div>

        {tab === "companies" ? (
          <>
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
                    <div key={i} className="h-12 animate-pulse rounded-md bg-slate-100" />
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
                    Save shippers in Command Center first — or use the Manual emails tab.
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
                  const enriched = c.company_id ? enrichedCounts[c.company_id] ?? 0 : 0;
                  const dim = enriched === 0;
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
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: dim ? "#FEF3C7" : "#D1FAE5",
                          borderColor: dim ? "#FDE68A" : "#A7F3D0",
                          color: dim ? "#92400e" : "#065f46",
                          fontFamily: fontDisplay,
                        }}
                        title={
                          dim
                            ? "No enriched contacts on this company. Selecting it will not email anyone unless contacts are added."
                            : `${enriched} contact${enriched === 1 ? "" : "s"} with email — these will be emailed.`
                        }
                      >
                        <UserCheck className="h-3 w-3" />
                        {enriched} {enriched === 1 ? "contact" : "contacts"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          // Manual emails tab
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <div
                className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
                style={{ fontFamily: fontDisplay }}
              >
                Add emails directly
              </div>
              <div
                className="mt-0.5 text-[11px] text-slate-500"
                style={{ fontFamily: fontBody }}
              >
                One per line. Optional CSV: <span style={{ fontFamily: fontMono }}>email, First, Last, Company</span> · or <span style={{ fontFamily: fontMono }}>"Name &lt;email&gt;"</span>
              </div>
            </div>
            <div className="px-5 py-3">
              <textarea
                value={manualBlob}
                onChange={(e) => setManualBlob(e.target.value)}
                onBlur={handleManualBlur}
                placeholder={`bob@acme.com\nalice@globex.com, Alice, Park, Globex Logistics\n"Linh Pham" <linh@northbay.example>`}
                rows={5}
                className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
                style={{ fontFamily: fontMono }}
              />
              {manualError ? (
                <div
                  className="mt-2 flex items-center gap-1.5 text-[11px] text-rose-600"
                  style={{ fontFamily: fontBody }}
                >
                  <AlertCircle className="h-3 w-3" />
                  {manualError}
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleAddSingle}
                  disabled={!manualBlob.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-[#0F172A] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-400"
                  style={{ fontFamily: fontDisplay }}
                >
                  <Plus className="h-3 w-3" />
                  Add to recipients
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-slate-100 px-5 py-3">
              <div
                className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500"
                style={{ fontFamily: fontDisplay }}
              >
                Manual recipients ({totalManual})
              </div>
              {manualEmails.length === 0 ? (
                <div
                  className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-[11px] text-slate-500"
                  style={{ fontFamily: fontBody }}
                >
                  None yet. Paste emails above and click "Add to recipients".
                </div>
              ) : (
                manualEmails.map((m) => (
                  <div
                    key={m.email}
                    className="mb-1.5 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5"
                  >
                    <Mail className="h-3 w-3 shrink-0 text-purple-500" />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-[12px] font-semibold text-[#0F172A]"
                        style={{ fontFamily: fontMono }}
                      >
                        {m.email}
                      </div>
                      {(m.first_name || m.last_name || m.company_name) && (
                        <div
                          className="truncate text-[10.5px] text-slate-500"
                          style={{ fontFamily: fontBody }}
                        >
                          {[
                            [m.first_name, m.last_name].filter(Boolean).join(" ") || null,
                            m.company_name || null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveManual(m.email)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                      aria-label="Remove"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <div className="flex flex-col">
            <span
              className="text-[11px] font-semibold text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              {totalEmailable} email{totalEmailable === 1 ? "" : "s"} will be queued
            </span>
            <span
              className="text-[10px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              {enrichedSelectedCount} from {selectedCount} companies · {totalManual} manual
            </span>
          </div>
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[11.5px] font-semibold transition"
      style={{
        borderColor: active ? "#3B82F6" : "transparent",
        color: active ? "#0F172A" : "#64748b",
        background: active ? "#fff" : "transparent",
        fontFamily: fontDisplay,
      }}
    >
      {children}
    </button>
  );
}
