"use client";

/**
 * Leads list — the Lead-CRM home. Mirrors the Command Center Accounts view:
 * a filter bar (stage / source / assignee / search) + a paginated desktop
 * table with a mobile card fallback, and a row click that opens the lead
 * detail drawer.
 *
 * Server-side filtering/pagination: `lit_leadcrm_list_leads` takes the stage /
 * source / assignee / q / limit / offset args, so we re-fetch on every filter
 * or page change (debounced search). Everything is null-safe — the backend is
 * near-empty until backfill, so an empty result renders an honest "No leads
 * yet" state rather than blanks or NaN.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  type Lead,
  type LeadStage,
  type Assignee,
  listLeads,
  listStages,
  listAssignees,
} from "@/api/leadCrm";
import LeadDetailDrawer from "./LeadDetailDrawer";
import {
  FONT_HEAD,
  FONT_BODY,
  FONT_MONO,
  formatRelative,
  initials,
  avatarColor,
  stageBadgeStyle,
  leadDisplayName,
} from "./leadCrmFormat";

const PAGE_SIZE = 50;

export default function LeadsListPage() {
  const [stageId, setStageId] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [assignee, setAssignee] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);

  // Debounce the search box → server query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 0 whenever a filter changes.
  useEffect(() => {
    setPage(0);
  }, [stageId, source, assignee, debouncedSearch]);

  // Reference data (stages + assignees) — cached, shared with the drawer.
  const { data: stages = [] } = useQuery<LeadStage[]>({
    queryKey: ["lead-crm", "stages"],
    queryFn: listStages,
    staleTime: 5 * 60_000,
  });
  const { data: assignees = [] } = useQuery<Assignee[]>({
    queryKey: ["lead-crm", "assignees"],
    queryFn: listAssignees,
    staleTime: 5 * 60_000,
  });

  const {
    data: leads = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<Lead[]>({
    queryKey: ["lead-crm", "leads", { stageId, source, assignee, q: debouncedSearch, page }],
    queryFn: () =>
      listLeads({
        stageId: stageId || null,
        source: source || null,
        assignee: assignee || null,
        q: debouncedSearch || null,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const stageById = useMemo(() => {
    const m: Record<string, LeadStage> = {};
    for (const s of stages) m[s.id] = s;
    return m;
  }, [stages]);

  // Source options — the known lead entry channels. Free-form values from the
  // backend still filter via the "All sources" default.
  const sourceOptions = useMemo(
    () => ["magnet", "product", "demo", "manual", "system", "email"],
    [],
  );

  const activeFilterCount =
    (stageId ? 1 : 0) + (source ? 1 : 0) + (assignee ? 1 : 0);

  const hasNextPage = leads.length === PAGE_SIZE;
  const pageStart = leads.length ? page * PAGE_SIZE + 1 : 0;
  const pageEnd = page * PAGE_SIZE + leads.length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8FAFC" }}>
      {/* Header + filter bar */}
      <div
        style={{
          padding: "18px 24px 14px",
          borderBottom: "1px solid #E5E7EB",
          background:
            "radial-gradient(circle at 0% 0%, rgba(59,130,246,0.06) 0%, rgba(59,130,246,0) 35%), linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: "#3B82F6", letterSpacing: "0.22em", textTransform: "uppercase" }}>
              Shared workspace
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", marginTop: 3 }}>
              Leads
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 2 }}>
              Work leads toward becoming subscribers
            </div>
          </div>
        </div>

        {/* Search + filter toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 360 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#94a3b8" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, company…"
              style={{
                width: "100%",
                background: "#F8FAFC",
                border: "1.5px solid #CBD5E1",
                borderRadius: 10,
                padding: "7px 12px 7px 30px",
                fontSize: 13,
                fontFamily: FONT_BODY,
                color: "#0F172A",
                outline: "none",
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 10,
              border: "1.5px solid " + (activeFilterCount > 0 ? "#3B82F6" : "#CBD5E1"),
              background: activeFilterCount > 0 ? "rgba(59,130,246,0.08)" : "#FFFFFF",
              color: activeFilterCount > 0 ? "#1D4ED8" : "#0F172A",
              fontFamily: FONT_HEAD,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Filter style={{ width: 13, height: 13 }} />
            Filters
            {activeFilterCount > 0 ? (
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#3B82F6", color: "#FFFFFF", fontSize: 10, fontWeight: 700 }}>
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 12, color: "#94a3b8", fontFamily: FONT_BODY }}>
            {isFetching ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : null}
            {leads.length} shown
          </div>
        </div>

        {filtersOpen ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: "#FFFFFF",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
              alignItems: "end",
            }}
          >
            <FilterField label="Stage">
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={selectStyle}>
                <option value="">All stages</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Source">
              <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle}>
                <option value="">All sources</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s} style={{ textTransform: "capitalize" }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Assignee">
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={selectStyle}>
                <option value="">All assignees</option>
                {assignees.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <div style={{ display: "flex", alignItems: "end", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setStageId("");
                  setSource("");
                  setAssignee("");
                  setSearch("");
                }}
                style={{
                  padding: "7px 12px",
                  border: "1.5px solid #CBD5E1",
                  borderRadius: 10,
                  background: "#FFFFFF",
                  color: "#475569",
                  fontFamily: FONT_HEAD,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reset filters
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Table / cards */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "64px 0", color: "#64748b", fontFamily: FONT_BODY, fontSize: 14 }}>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            Loading leads…
          </div>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "#F1F5F9", marginBottom: 16 }}>
              <Users style={{ width: 24, height: 24, color: "#94a3b8" }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", fontFamily: FONT_HEAD }}>
              {activeFilterCount > 0 || debouncedSearch ? "No leads match this view" : "No leads yet"}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", fontFamily: FONT_BODY, marginTop: 4 }}>
              {activeFilterCount > 0 || debouncedSearch
                ? "Try clearing a filter or search."
                : "Leads will appear here as they come in from magnets, product signups, and demos."}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table (≥md) */}
            <div className="hidden md:block" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 1080 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr style={{ background: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}>
                    {["Lead", "Company", "Stage", "Source", "Score", "Assignee", "Last activity"].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 4 ? "right" : "left",
                          padding: "10px 14px",
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.09em",
                          textTransform: "uppercase",
                          color: "#94A3B8",
                          fontFamily: FONT_HEAD,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const stage = lead.stage_id ? stageById[lead.stage_id] : undefined;
                    const name = leadDisplayName(lead.full_name, lead.email);
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setOpenLead(lead)}
                        style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: avatarColor(name), color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {initials(name)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", fontFamily: FONT_HEAD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {name}
                              </div>
                              <div style={{ fontSize: 10.5, color: "#94A3B8", fontFamily: FONT_BODY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {lead.email || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: 12.5, color: "#334155", fontFamily: FONT_BODY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "100%" }}>
                            {lead.company_name || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          {stage ? <span style={stageBadgeStyle(stage.color)}>{stage.name}</span> : <span style={{ color: "#94A3B8", fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: 12, color: "#475569", fontFamily: FONT_BODY, textTransform: "capitalize" }}>
                            {lead.primary_source || lead.magnet_slug || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle", textAlign: "right" }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, color: lead.lead_score != null ? "#1d4ed8" : "#94A3B8" }}>
                            {lead.lead_score != null ? lead.lead_score : "—"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: 12, color: "#475569", fontFamily: FONT_BODY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "100%" }}>
                            {lead.assignee_name || "Unassigned"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: 12, color: "#64748b", fontFamily: FONT_BODY, whiteSpace: "nowrap" }}>
                            {formatRelative(lead.last_activity_at)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards (<md) */}
            <div className="block md:hidden p-3 space-y-2">
              {leads.map((lead) => {
                const stage = lead.stage_id ? stageById[lead.stage_id] : undefined;
                const name = leadDisplayName(lead.full_name, lead.email);
                return (
                  <div
                    key={`m-${lead.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenLead(lead)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenLead(lead);
                      }
                    }}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                        style={{ background: avatarColor(name), fontFamily: FONT_HEAD }}
                      >
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate" style={{ fontFamily: FONT_HEAD }}>
                          {name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate" style={{ fontFamily: FONT_BODY }}>
                          {lead.email || "—"}
                        </div>
                      </div>
                      {stage ? <span style={stageBadgeStyle(stage.color)}>{stage.name}</span> : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Cell label="Company" value={lead.company_name || "—"} />
                      <Cell label="Source" value={lead.primary_source || lead.magnet_slug || "—"} />
                      <Cell label="Assignee" value={lead.assignee_name || "Unassigned"} />
                      <Cell label="Last activity" value={formatRelative(lead.last_activity_at)} />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-blue-600">Open →</span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: lead.lead_score != null ? "#1d4ed8" : "#94A3B8" }}>
                        {lead.lead_score != null ? `Score ${lead.lead_score}` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && leads.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA", flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#64748b", fontFamily: FONT_BODY }}>
            Showing {pageStart}–{pageEnd}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={pageBtn(page === 0)}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
              Prev
            </button>
            <span style={{ padding: "0 10px", height: 32, display: "inline-flex", alignItems: "center", borderRadius: 8, border: "1px solid #E5E7EB", background: "#FFFFFF", fontSize: 12, fontWeight: 700, color: "#0F172A", fontFamily: FONT_HEAD }}>
              Page {page + 1}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
              style={pageBtn(!hasNextPage)}
            >
              Next
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      ) : null}

      {openLead ? (
        <LeadDetailDrawer
          lead={openLead}
          stages={stages}
          assignees={assignees}
          onClose={() => setOpenLead(null)}
          onChanged={() => refetch()}
        />
      ) : null}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="truncate text-slate-700" style={{ fontFamily: FONT_BODY, textTransform: label === "Source" ? "capitalize" : "none" }} title={value}>
        {value}
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1.5px solid #CBD5E1",
  background: "#FFFFFF",
  fontFamily: FONT_BODY,
  fontSize: 12.5,
  color: "#0F172A",
  outline: "none",
};

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 32,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontFamily: FONT_HEAD,
  };
}
