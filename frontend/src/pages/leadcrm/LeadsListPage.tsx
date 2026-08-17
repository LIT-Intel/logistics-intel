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
  Plus,
  X,
  Building2,
  Mail,
  MapPin,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useToast } from "@/components/ui/use-toast";
import {
  type Lead,
  type LeadStage,
  type Assignee,
  type CompanySearchResult,
  type ListLeadsResult,
  type PipelineSummary,
  type LeadStatusFilter,
  listLeadsPage,
  listStages,
  listAssignees,
  getLead,
  getPipelineSummary,
  createLead,
  createLeadFromCompany,
  searchCompanies,
  archiveLead,
  deleteLead,
  restoreLead,
} from "@/api/leadCrm";
import LeadDetailDrawer from "./LeadDetailDrawer";
import LeadCrmKpis, { type StageChip } from "./LeadCrmKpis";
import {
  FONT_HEAD,
  FONT_BODY,
  FONT_MONO,
  asText,
  formatRelative,
  initials,
  avatarColor,
  stageBadgeStyle,
  leadDisplayName,
  type LeadCrmThemeTokens,
} from "./leadCrmFormat";
import { useLeadCrmTheme } from "./LeadCrmTheme";

const PAGE_SIZE = 50;

const STATUS_TABS: { value: LeadStatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "deleted", label: "Deleted" },
];

export default function LeadsListPage() {
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const [stageId, setStageId] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [assignee, setAssignee] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>("active");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);

  // Debounce the search box → server query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 0 whenever a filter changes.
  useEffect(() => {
    setPage(0);
  }, [stageId, source, assignee, debouncedSearch, statusFilter]);

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

  // Pipeline summary powers the KPI row (totals + conversions + per-stage chips).
  const { data: summary = null, isLoading: summaryLoading } = useQuery<PipelineSummary>({
    queryKey: ["lead-crm", "pipeline-summary-full"],
    queryFn: getPipelineSummary,
    staleTime: 30_000,
  });

  const {
    data: page_result = { leads: [], total: 0 },
    isLoading,
    isFetching,
    refetch,
  } = useQuery<ListLeadsResult>({
    queryKey: ["lead-crm", "leads", { stageId, source, assignee, q: debouncedSearch, status: statusFilter, page }],
    queryFn: () =>
      listLeadsPage({
        stageId: stageId || null,
        source: source || null,
        assignee: assignee || null,
        q: debouncedSearch || null,
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
  const leads = page_result.leads;
  const totalLeads = page_result.total;

  const stageById = useMemo(() => {
    const m: Record<string, LeadStage> = {};
    for (const s of stages) m[s.id] = s;
    return m;
  }, [stages]);

  // Ordered per-stage chips for the KPI row — colors resolved from the stage
  // reference data (falls back to the summary's own color). Values are counts,
  // rendered as text so no jsonb leaks through as a React child.
  const stageChips = useMemo<StageChip[]>(() => {
    const rows = summary?.stages ?? [];
    return [...rows]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((s) => ({
        stage_id: s.stage_id,
        name: s.stage ?? (s.stage_id ? stageById[s.stage_id]?.name : null) ?? "Stage",
        color: s.color ?? (s.stage_id ? stageById[s.stage_id]?.color ?? null : null),
        count: s.count,
      }));
  }, [summary, stageById]);

  // Source options — the known lead entry channels. Free-form values from the
  // backend still filter via the "All sources" default.
  const sourceOptions = useMemo(
    () => ["magnet", "product", "demo", "manual", "system", "email"],
    [],
  );

  const activeFilterCount =
    (stageId ? 1 : 0) + (source ? 1 : 0) + (assignee ? 1 : 0);

  const hasNextPage = (page + 1) * PAGE_SIZE < totalLeads;
  const pageStart = leads.length ? page * PAGE_SIZE + 1 : 0;
  const pageEnd = page * PAGE_SIZE + leads.length;

  // Row lifecycle actions (archive / delete / restore). Close the row menu,
  // toast, then refetch the list. All server-gated + soft (no data loss).
  async function runLifecycle(action: "archive" | "unarchive" | "delete" | "restore", leadId: string) {
    setRowMenuId(null);
    try {
      if (action === "archive") await archiveLead(leadId, true);
      else if (action === "unarchive") await archiveLead(leadId, false);
      else if (action === "delete") await deleteLead(leadId);
      else await restoreLead(leadId);
      toast({
        title:
          action === "archive" ? "Lead archived"
          : action === "unarchive" ? "Lead unarchived"
          : action === "delete" ? "Lead deleted"
          : "Lead restored",
      });
      await refetch();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: theme.bg }}>
      {/* Header + filter bar */}
      <div
        style={{
          padding: "18px 24px 14px",
          borderBottom: `1px solid ${theme.border}`,
          background: theme.panel,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: theme.accent, letterSpacing: "0.22em", textTransform: "uppercase" }}>
              Shared workspace
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: theme.heading, letterSpacing: "-0.02em", marginTop: 3 }}>
              Leads
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
              Work leads toward becoming subscribers
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              borderRadius: 10,
              border: "none",
              background: theme.accent,
              color: theme.accentText,
              fontFamily: FONT_HEAD,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add opportunity
          </button>
        </div>

        {/* KPI row — Attio-style headline metrics + per-stage chips */}
        <div style={{ marginBottom: 12 }}>
          <LeadCrmKpis
            summary={summary}
            totalLeads={totalLeads}
            stageChips={stageChips}
            loading={summaryLoading}
          />
        </div>

        {/* Search + filter toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 360 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: theme.textFaint }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, company…"
              style={{
                width: "100%",
                background: theme.inputBg,
                border: `1.5px solid ${theme.borderStrong}`,
                borderRadius: 10,
                padding: "7px 12px 7px 30px",
                fontSize: 13,
                fontFamily: FONT_BODY,
                color: theme.text,
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
              border: "1.5px solid " + (activeFilterCount > 0 ? theme.accentBorder : theme.borderStrong),
              background: activeFilterCount > 0 ? theme.accentSoft : theme.panel,
              color: activeFilterCount > 0 ? theme.accentSoftText : theme.text,
              fontFamily: FONT_HEAD,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Filter style={{ width: 13, height: 13 }} />
            Filters
            {activeFilterCount > 0 ? (
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: theme.accent, color: theme.accentText, fontSize: 10, fontWeight: 700 }}>
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          {/* Lifecycle view tabs — Active (default) / Archived / Deleted. */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 3, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.panel }}>
            {STATUS_TABS.map((t) => {
              const on = statusFilter === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setStatusFilter(t.value)}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 8,
                    border: "none",
                    background: on ? theme.accent : "transparent",
                    color: on ? theme.accentText : theme.textMuted,
                    fontFamily: FONT_HEAD,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 12, color: theme.textFaint, fontFamily: FONT_BODY }}>
            {isFetching ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : null}
            {totalLeads} total · {leads.length} shown
          </div>
        </div>

        {filtersOpen ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
              alignItems: "end",
            }}
          >
            <FilterField label="Stage">
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={selectStyle(theme)}>
                <option value="">All stages</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Source">
              <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle(theme)}>
                <option value="">All sources</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s} style={{ textTransform: "capitalize" }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Assignee">
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={selectStyle(theme)}>
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
                  border: `1.5px solid ${theme.borderStrong}`,
                  borderRadius: 10,
                  background: theme.panel,
                  color: theme.textMuted,
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "64px 0", color: theme.textMuted, fontFamily: FONT_BODY, fontSize: 14 }}>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            Loading leads…
          </div>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: theme.panelMuted, marginBottom: 16 }}>
              <Users style={{ width: 24, height: 24, color: theme.textFaint }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.heading, fontFamily: FONT_HEAD }}>
              {statusFilter === "archived"
                ? "No archived leads"
                : statusFilter === "deleted"
                ? "No deleted leads"
                : activeFilterCount > 0 || debouncedSearch
                ? "No leads match this view"
                : "No leads yet"}
            </div>
            <div style={{ fontSize: 13, color: theme.textMuted, fontFamily: FONT_BODY, marginTop: 4 }}>
              {statusFilter === "archived"
                ? "Archived leads are hidden from the active pipeline. Archive a lead to park it here."
                : statusFilter === "deleted"
                ? "Deleted leads are soft-deleted and can be restored from here."
                : activeFilterCount > 0 || debouncedSearch
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
                  <tr style={{ background: theme.panel, borderBottom: `1px solid ${theme.border}` }}>
                    {["Lead", "Company", "Stage", "Source", "Score", "Assignee", "Last activity", ""].map((h, i) => (
                      <th
                        key={h || `col-${i}`}
                        style={{
                          textAlign: i === 4 ? "right" : "left",
                          padding: "10px 14px",
                          width: i === 7 ? 48 : undefined,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.09em",
                          textTransform: "uppercase",
                          color: theme.textFaint,
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
                        style={{ borderBottom: `1px solid ${theme.border}`, cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = theme.hover)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: avatarColor(name), color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {initials(name)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: theme.heading, fontFamily: FONT_HEAD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {asText(name)}
                              </div>
                              <div style={{ fontSize: 10.5, color: theme.textFaint, fontFamily: FONT_BODY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {asText(lead.email) || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            {lead.company_name || lead.company_domain ? (
                              <CompanyAvatar
                                name={lead.company_name || lead.company_domain || "Company"}
                                domain={lead.company_domain}
                                logoUrl={lead.company_logo_url}
                                size="sm"
                                className="!h-6 !w-6 !rounded-md shrink-0"
                              />
                            ) : null}
                            <span style={{ fontSize: 12.5, color: theme.text, fontFamily: FONT_BODY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "100%" }}>
                              {asText(lead.company_name) || asText(lead.company_domain) || "—"}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          {stage ? <span style={stageBadgeStyle(stage.color)}>{asText(stage.name)}</span> : <span style={{ color: theme.textFaint, fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: FONT_BODY, textTransform: "capitalize" }}>
                            {asText(lead.primary_source) || asText(lead.magnet_slug) || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle", textAlign: "right" }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, color: lead.lead_score != null ? theme.accentSoftText : theme.textFaint }}>
                            {lead.lead_score != null ? asText(lead.lead_score) : "—"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: FONT_BODY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "100%" }}>
                            {asText(lead.assignee_name) || "Unassigned"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: FONT_BODY, whiteSpace: "nowrap" }}>
                            {formatRelative(lead.last_activity_at)}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", verticalAlign: "middle", textAlign: "right" }}>
                          <RowActions
                            lead={lead}
                            open={rowMenuId === lead.id}
                            onToggle={() => setRowMenuId((id) => (id === lead.id ? null : lead.id))}
                            onClose={() => setRowMenuId(null)}
                            onAction={(a) => runLifecycle(a, lead.id)}
                          />
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
                          {asText(name)}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate" style={{ fontFamily: FONT_BODY }}>
                          {asText(lead.email) || "—"}
                        </div>
                      </div>
                      {stage ? <span style={stageBadgeStyle(stage.color)}>{asText(stage.name)}</span> : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Cell label="Company" value={asText(lead.company_name) || "—"} />
                      <Cell label="Source" value={asText(lead.primary_source) || asText(lead.magnet_slug) || "—"} />
                      <Cell label="Assignee" value={asText(lead.assignee_name) || "Unassigned"} />
                      <Cell label="Last activity" value={formatRelative(lead.last_activity_at)} />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-blue-600">Open →</span>
                      <div className="flex items-center gap-2">
                        <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: lead.lead_score != null ? "#1d4ed8" : "#94A3B8" }}>
                          {lead.lead_score != null ? `Score ${lead.lead_score}` : "—"}
                        </span>
                        <RowActions
                          lead={lead}
                          open={rowMenuId === lead.id}
                          onToggle={() => setRowMenuId((id) => (id === lead.id ? null : lead.id))}
                          onClose={() => setRowMenuId(null)}
                          onAction={(a) => runLifecycle(a, lead.id)}
                        />
                      </div>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderTop: `1px solid ${theme.border}`, background: theme.panelAlt, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: FONT_BODY }}>
            Showing {pageStart}–{pageEnd} of {totalLeads}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={pageBtn(page === 0, theme)}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
              Prev
            </button>
            <span style={{ padding: "0 10px", height: 32, display: "inline-flex", alignItems: "center", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.panel, fontSize: 12, fontWeight: 700, color: theme.heading, fontFamily: FONT_HEAD }}>
              Page {page + 1}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
              style={pageBtn(!hasNextPage, theme)}
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
          onRemoved={() => {
            setOpenLead(null);
            refetch();
          }}
        />
      ) : null}

      {addOpen ? (
        <AddOpportunityModal
          stages={stages}
          assignees={assignees}
          onClose={() => setAddOpen(false)}
          onCreated={async (leadId) => {
            setAddOpen(false);
            await refetch();
            const full = await getLead(leadId);
            if (full) setOpenLead(full);
          }}
        />
      ) : null}
    </div>
  );
}

// ── Add-opportunity modal (manual lead creation → lit_leadcrm_create_lead) ────

type AddMode = "company" | "manual";

function AddOpportunityModal({
  stages,
  assignees,
  onClose,
  onCreated,
}: {
  stages: LeadStage[];
  assignees: Assignee[];
  onClose: () => void;
  onCreated: (leadId: string) => void;
}) {
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const mInput = modalInput(theme);
  const [mode, setMode] = useState<AddMode>("company");

  // Shared placement fields.
  const [stageId, setStageId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  // "Add by email / manual" fields.
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");

  // "Add by company" (typeahead over existing LIT companies) state.
  const [companyQuery, setCompanyQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [picked, setPicked] = useState<CompanySearchResult | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(companyQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [companyQuery]);

  const { data: results = [], isFetching: searching } = useQuery<CompanySearchResult[]>({
    queryKey: ["lead-crm", "company-search", debouncedQuery],
    queryFn: () => searchCompanies(debouncedQuery, 20),
    enabled: mode === "company" && debouncedQuery.length >= 2 && !picked,
    staleTime: 60_000,
  });

  const canSubmit =
    mode === "manual"
      ? Boolean(email.trim() || companyName.trim())
      : Boolean(picked);

  async function handleSubmit() {
    if (busy || !canSubmit) return;
    setBusy(true);
    try {
      let res;
      if (mode === "company" && picked) {
        res = await createLeadFromCompany({
          companyId: picked.id,
          sourceCompanyKey: picked.source_company_key,
          companyName: picked.name,
          stageId: stageId || null,
          assignee: assignee || null,
        });
      } else {
        res = await createLead({
          email: email.trim() || null,
          fullName: fullName.trim() || null,
          companyName: companyName.trim() || null,
          stageId: stageId || null,
          assignee: assignee || null,
          notes: notes.trim() || null,
        });
      }
      if (!res.ok || !res.lead_id) {
        const title =
          res.reason === "invalid_email"
            ? "Invalid email"
            : res.reason === "email_or_company_required"
            ? "Add an email or a company"
            : res.reason === "company_required"
            ? "Pick a company first"
            : "Could not create opportunity";
        toast({ title, variant: "destructive" });
        return;
      }
      toast({ title: res.merged ? "Merged into existing lead" : "Opportunity added" });
      onCreated(res.lead_id);
    } catch (e: any) {
      toast({ title: "Could not create opportunity", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: theme.overlay }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", width: "min(480px, 100%)", background: theme.panel, borderRadius: 16, boxShadow: `0 24px 48px ${theme.shadow}`, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: theme.heading }}>Add opportunity</div>
          <button onClick={onClose} style={{ display: "inline-flex", width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.panel, color: theme.textMuted, cursor: "pointer" }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Mode toggle: pull an existing LIT company (brokers/forwarders/etc.)
            or add manually by email. */}
        <div style={{ display: "flex", gap: 6, padding: "12px 18px 0" }}>
          <ModeTab active={mode === "company"} onClick={() => setMode("company")} icon={<Building2 style={{ width: 13, height: 13 }} />} label="Add from LIT" />
          <ModeTab active={mode === "manual"} onClick={() => setMode("manual")} icon={<Mail style={{ width: 13, height: 13 }} />} label="Add by email / manual" />
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "company" ? (
            <>
              {picked ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${theme.accentBorder}`, borderRadius: 12, background: theme.accentSoft }}>
                  <CompanyAvatar name={picked.name} domain={picked.domain} size="sm" className="!h-8 !w-8 !rounded-lg shrink-0" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asText(picked.name)}</div>
                    <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: theme.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[picked.city, picked.state, picked.country].filter(Boolean).join(", ") || picked.domain || (picked.origin === "directory" ? "Directory" : "Company")}
                      {picked.has_snapshot ? " · shipment data" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPicked(null); setCompanyQuery(""); }}
                    style={{ display: "inline-flex", width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 8, border: `1px solid ${theme.accentBorder}`, background: theme.panel, color: theme.accent, cursor: "pointer", flexShrink: 0 }}
                    title="Change company"
                  >
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ) : (
                <ModalField label="Company">
                  <div style={{ position: "relative" }}>
                    <input
                      value={companyQuery}
                      onChange={(e) => setCompanyQuery(e.target.value)}
                      placeholder="Search LIT companies, brokers, forwarders…"
                      style={mInput}
                      autoFocus
                    />
                    {searching ? (
                      <Loader2 style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#94a3b8", animation: "spin 1s linear infinite" }} />
                    ) : null}
                    {/* Show the dropdown whenever there's a live query and nothing
                        is picked yet. Selection uses onClick (reliable on touch +
                        trackpad) and the list is NOT gated on input focus — the
                        prior focus/blur-timer race could unmount the results
                        before the pick registered, which is why "Add from LIT"
                        appeared to do nothing. An outside-click scrim closes it. */}
                    {debouncedQuery.length >= 2 ? (
                      <>
                        <div
                          onClick={() => setCompanyQuery("")}
                          style={{ position: "fixed", inset: 0, zIndex: 4 }}
                        />
                        <div style={{ position: "absolute", zIndex: 5, top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 260, overflowY: "auto", background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12, boxShadow: `0 12px 28px ${theme.shadow}` }}>
                        {results.length === 0 && !searching ? (
                          <div style={{ padding: "12px 14px", fontFamily: FONT_BODY, fontSize: 12.5, color: theme.textFaint }}>
                            No LIT companies match. Switch to "Add by email / manual" to create a new one.
                          </div>
                        ) : (
                          results.map((c, i) => (
                            <button
                              key={`${c.origin}-${c.id ?? c.source_company_key ?? i}`}
                              type="button"
                              onClick={() => { setPicked(c); }}
                              style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "8px 12px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${theme.border}`, background: theme.panel, cursor: "pointer", textAlign: "left" }}
                            >
                              <CompanyAvatar name={c.name} domain={c.domain} size="sm" className="!h-7 !w-7 !rounded-md shrink-0" />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asText(c.name)}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT_BODY, fontSize: 10.5, color: theme.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {(c.city || c.state || c.country) ? <MapPin style={{ width: 10, height: 10, flexShrink: 0 }} /> : null}
                                  {[c.city, c.state, c.country].filter(Boolean).join(", ") || c.domain || (c.origin === "directory" ? "Directory" : "Company")}
                                  {c.has_snapshot ? " · shipments" : ""}
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </ModalField>
              )}
              <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textFaint, marginTop: -4 }}>
                No email? Add the company and use Enrich to find contacts.
              </div>
            </>
          ) : (
            <>
              <ModalField label="Email (optional)">
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" style={mInput} autoFocus />
              </ModalField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <ModalField label="Full name">
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" style={mInput} />
                </ModalField>
                <ModalField label="Company">
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" style={mInput} />
                </ModalField>
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textFaint, marginTop: -4 }}>
                Add at least an email or a company. No email? Add the company and use Enrich to find contacts.
              </div>
              <ModalField label="Notes">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional context…" style={{ ...mInput, resize: "vertical" }} />
              </ModalField>
            </>
          )}

          {/* Shared placement (both modes) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ModalField label="Stage">
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={mInput}>
                <option value="">New (default)</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </ModalField>
            <ModalField label="Assignee">
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={mInput}>
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.user_id} value={a.user_id}>{a.name}</option>
                ))}
              </select>
            </ModalField>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 18px", borderTop: `1px solid ${theme.border}`, background: theme.panelAlt }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${theme.borderStrong}`, background: theme.panel, color: theme.textMuted, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={busy || !canSubmit} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: theme.accent, color: theme.accentText, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: busy || !canSubmit ? "not-allowed" : "pointer", opacity: busy || !canSubmit ? 0.6 : 1 }}>
            {busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 14, height: 14 }} />}
            Add opportunity
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row kebab menu (archive / delete / restore) ──────────────────────────────

type RowAction = "archive" | "unarchive" | "delete" | "restore";

function RowActions({
  lead,
  open,
  onToggle,
  onClose,
  onAction,
}: {
  lead: Lead;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onAction: (a: RowAction) => void;
}) {
  const { theme } = useLeadCrmTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isArchived = Boolean(lead.archived_at);
  const isDeleted = Boolean(lead.deleted_at);

  // Reset the delete confirm whenever the menu closes.
  useEffect(() => {
    if (!open) setConfirmDelete(false);
  }, [open]);

  return (
    <div style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title="Actions"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: 8, border: `1px solid ${theme.border}`,
          background: theme.panel, color: theme.textMuted, cursor: "pointer",
        }}
      >
        <MoreHorizontal style={{ width: 15, height: 15 }} />
      </button>

      {open ? (
        <>
          <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            role="menu"
            style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 41, width: 190,
              background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12,
              boxShadow: `0 12px 28px ${theme.shadow}`, padding: 6,
              display: "flex", flexDirection: "column", gap: 2, textAlign: "left",
            }}
          >
            {isArchived || isDeleted ? (
              <RowMenuItem icon={<RotateCcw style={rowMenuIco} />} label="Restore" onClick={() => onAction("restore")} />
            ) : null}
            {!isDeleted ? (
              isArchived ? (
                <RowMenuItem icon={<ArchiveRestore style={rowMenuIco} />} label="Unarchive" onClick={() => onAction("unarchive")} />
              ) : (
                <RowMenuItem icon={<Archive style={rowMenuIco} />} label="Archive" onClick={() => onAction("archive")} />
              )
            ) : null}
            {!isDeleted ? (
              confirmDelete ? (
                <RowMenuItem icon={<Trash2 style={rowMenuIco} />} label="Confirm delete" danger onClick={() => onAction("delete")} />
              ) : (
                <RowMenuItem icon={<Trash2 style={rowMenuIco} />} label="Delete" danger onClick={() => setConfirmDelete(true)} />
              )
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

const rowMenuIco: React.CSSProperties = { width: 14, height: 14 };

function RowMenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const { theme } = useLeadCrmTheme();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
        border: "none", borderRadius: 8, background: "transparent", cursor: "pointer",
        fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, textAlign: "left",
        color: danger ? theme.danger : theme.text,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? theme.dangerSoft : theme.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      {label}
    </button>
  );
}

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  const { theme } = useLeadCrmTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 9,
        border: "1.5px solid " + (active ? theme.accentBorder : theme.border),
        background: active ? theme.accentSoft : theme.panel,
        color: active ? theme.accentSoftText : theme.textMuted,
        fontFamily: FONT_HEAD,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useLeadCrmTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.textMuted }}>{label}</span>
      {children}
    </label>
  );
}

function modalInput(theme: LeadCrmThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1.5px solid ${theme.borderStrong}`,
    background: theme.inputBg,
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: theme.text,
    outline: "none",
  };
}

function Cell({ label, value }: { label: string; value: string }) {
  const { theme } = useLeadCrmTheme();
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: theme.textFaint }}>{label}</div>
      <div className="truncate" style={{ color: theme.text, fontFamily: FONT_BODY, textTransform: label === "Source" ? "capitalize" : "none" }} title={value}>
        {value}
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useLeadCrmTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: theme.textMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function selectStyle(theme: LeadCrmThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 8,
    border: `1.5px solid ${theme.borderStrong}`,
    background: theme.inputBg,
    fontFamily: FONT_BODY,
    fontSize: 12.5,
    color: theme.text,
    outline: "none",
  };
}

function pageBtn(disabled: boolean, theme: LeadCrmThemeTokens): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 32,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    background: theme.panel,
    fontSize: 12,
    fontWeight: 600,
    color: theme.textMuted,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontFamily: FONT_HEAD,
  };
}
