"use client";

import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Check, ChevronLeft, ChevronRight, Loader2, MapPin, Search, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { createLead, updateLead } from "@/api/leadCrm";
import { useToast } from "@/components/ui/use-toast";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { FONT_BODY, FONT_HEAD } from "./leadCrmFormat";
import { useLeadCrmTheme } from "./LeadCrmTheme";

type ApolloCompany = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  logo_url: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  employee_count: number | null;
  linkedin_url: string | null;
  saved: boolean;
  saved_lead_id: string | null;
  saved_status: "active" | "archived" | "deleted" | null;
  qualification_status: "unverified" | "qualified" | "disqualified" | "review";
  qualification_company_type: string | null;
  qualification_confidence: number | null;
  qualification_reason: string | null;
  safe_to_enrich: boolean;
};

const DEFAULT_KEYWORDS = "freight broker, freight forwarder";
const PAGE_SIZE = 50;

type ApolloPagination = {
  page: number;
  perPage: number;
  totalEntries: number | null;
  totalPages: number | null;
};

const INITIAL_PAGINATION: ApolloPagination = {
  page: 1,
  perPage: PAGE_SIZE,
  totalEntries: null,
  totalPages: null,
};

export default function FindLeadsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const pageRef = useRef<HTMLDivElement>(null);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [location, setLocation] = useState("United States");
  const [results, setResults] = useState<ApolloCompany[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);
  const [pagination, setPagination] = useState<ApolloPagination>(INITIAL_PAGINATION);

  const selectableIds = useMemo(
    () => results
      .filter((r) => !r.saved && !saved.has(r.id) && !["disqualified", "review"].includes(r.qualification_status))
      .map((r) => r.id),
    [results, saved],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  async function runSearch(requestedPage = 1) {
    if (!keywords.trim()) return;
    setSearching(true);
    setSearched(true);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("lead-crm-find-leads", {
        body: { keywords: keywords.split(",").map((v) => v.trim()).filter(Boolean), location: location.trim() || null, page: requestedPage, per_page: PAGE_SIZE },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Apollo search failed");
      const companies = Array.isArray(data.companies) ? data.companies : [];
      const meta = data?.pagination ?? {};
      const totalEntries = Number(meta.total_entries ?? meta.totalEntries);
      const totalPages = Number(meta.total_pages ?? meta.totalPages);
      setResults(companies);
      setSaved(new Set(companies.filter((company: ApolloCompany) => company.saved).map((company: ApolloCompany) => company.id)));
      setPagination({
        page: Number(meta.page) || requestedPage,
        perPage: Number(meta.per_page ?? meta.perPage) || PAGE_SIZE,
        totalEntries: Number.isFinite(totalEntries) ? totalEntries : null,
        totalPages: Number.isFinite(totalPages) ? totalPages : null,
      });
      if (requestedPage > 1) pageRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      setResults([]);
      setPagination((current) => ({ ...current, page: requestedPage }));
      toast({ title: "Search failed", description: error?.message || "Could not search Apollo.", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  function toggle(company: ApolloCompany) {
    if (company.saved || saved.has(company.id) || ["disqualified", "review"].includes(company.qualification_status)) return;
    setSelected((current) => {
      const next = new Set(current);
      next.has(company.id) ? next.delete(company.id) : next.add(company.id);
      return next;
    });
  }

  async function qualifyCompany(company: ApolloCompany): Promise<ApolloCompany | null> {
    if (company.safe_to_enrich) return company;
    setVerifying((current) => new Set(current).add(company.id));
    try {
      const { data, error } = await supabase.functions.invoke("lead-crm-qualify-company", {
        body: {
          provider_company_id: company.id,
          company_name: company.name,
          domain: company.domain,
          website: company.website,
          linkedin_url: company.linkedin_url,
          industry: company.industry,
          location: [company.city, company.state, company.country].filter(Boolean).join(", ") || null,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Company verification failed");
      const qualification = data.qualification;
      const updated: ApolloCompany = {
        ...company,
        qualification_status: qualification.status,
        qualification_company_type: qualification.company_type,
        qualification_confidence: Number(qualification.confidence),
        qualification_reason: qualification.reason,
        safe_to_enrich: Boolean(qualification.safe_to_enrich),
      };
      setResults((current) => current.map((row) => row.id === company.id ? updated : row));
      if (!updated.safe_to_enrich) {
        toast({
          title: updated.qualification_status === "disqualified" ? "Not a qualified lead" : "Manual review required",
          description: updated.qualification_reason || "The company cannot proceed to enrichment.",
          variant: "destructive",
        });
        return null;
      }
      return updated;
    } catch (error: any) {
      toast({ title: "Verification failed", description: error?.message || "Could not verify this company.", variant: "destructive" });
      return null;
    } finally {
      setVerifying((current) => {
        const next = new Set(current);
        next.delete(company.id);
        return next;
      });
    }
  }

  async function saveCompanies(ids: string[]) {
    const companies = results.filter((company) => ids.includes(company.id) && !company.saved && !saved.has(company.id));
    if (!companies.length) return;
    setSaving(true);
    let success = 0;
    let rejected = 0;
    const completed = new Set<string>();
    for (const company of companies) {
      const qualified = await qualifyCompany(company);
      if (!qualified) {
        rejected += 1;
        continue;
      }
      try {
        const { data, error } = await supabase.rpc("lit_leadcrm_import_apollo_company", {
          p_apollo_organization_id: qualified.id,
          p_company_name: qualified.name,
          p_website: qualified.website,
          p_company_domain: qualified.domain,
          p_logo_url: qualified.logo_url,
          p_company_city: qualified.city,
          p_company_state: qualified.state,
          p_company_country: qualified.country,
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result?.ok) throw new Error(result?.reason || "Company could not be saved");
        success += 1;
        completed.add(qualified.id);
        setResults((current) => current.map((row) => row.id === qualified.id ? {
          ...row,
          saved: true,
          saved_lead_id: result.lead_id,
          saved_status: result.saved_status || "active",
        } : row));
      } catch (error: any) {
        toast({ title: `Could not save ${qualified.name}`, description: error?.message || "Import failed.", variant: "destructive" });
      }
    }
    setSaved((current) => new Set([...current, ...completed]));
    setSelected((current) => new Set([...current].filter((id) => !completed.has(id))));
    setSaving(false);
    toast({
      title: success ? "Qualified leads saved" : "No leads saved",
      description: `${success} saved${rejected ? ` · ${rejected} rejected or held for review` : ""}.`,
      variant: success === 0 ? "destructive" : undefined,
    });
  }

  return (
    <div
      ref={pageRef}
      style={{
        flex: 1,
        minHeight: 0,
        height: "100%",
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        background: theme.bg,
        color: theme.text,
        fontFamily: FONT_BODY,
      }}
    >
      <header style={{ padding: "18px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.panel }}>
        <button onClick={() => navigate("/app/leads")} style={linkButton(theme.textMuted)}><ArrowLeft size={14} /> Back to leads</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
          <div>
            <div style={{ color: theme.accent, fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase" }}>Apollo prospecting</div>
            <h1 style={{ margin: "4px 0 0", fontFamily: FONT_HEAD, fontSize: 22, color: theme.heading }}>Find leads</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.textMuted }}>Search freight brokers and freight forwarders, then add one or many companies to the CRM.</p>
          </div>
          <button disabled={!selected.size || saving} onClick={() => saveCompanies([...selected])} style={primaryButton(theme, !selected.size || saving)}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} Save selected {selected.size ? `(${selected.size})` : ""}
          </button>
        </div>
      </header>

      <main style={{ width: "100%", padding: 24, maxWidth: 1240, margin: "0 auto" }}>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(210px, .55fr) auto", gap: 10, padding: 16, border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.panel }} className="max-md:!grid-cols-1">
          <Field label="Company keywords" theme={theme}><input value={keywords} onChange={(e) => setKeywords(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder={DEFAULT_KEYWORDS} style={inputStyle(theme)} /></Field>
          <Field label="Company location" theme={theme}><input value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="United States" style={inputStyle(theme)} /></Field>
          <button disabled={searching || !keywords.trim()} onClick={() => runSearch(1)} style={{ ...primaryButton(theme, searching || !keywords.trim()), alignSelf: "end", height: 39 }}>
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Search Apollo
          </button>
        </section>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px", minHeight: 28 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: theme.heading }}>
            {searched
              ? pagination.totalEntries != null
                ? `Showing ${(pagination.page - 1) * pagination.perPage + (results.length ? 1 : 0)}–${(pagination.page - 1) * pagination.perPage + results.length} of ${pagination.totalEntries.toLocaleString()} companies`
                : `${results.length} companies found · Page ${pagination.page}`
              : "Ready to search"}
          </div>
          {results.length > 0 ? <button onClick={() => setSelected(allSelected ? new Set() : new Set(selectableIds))} style={linkButton(theme.accent)}>{allSelected ? "Clear selection" : "Select all"}</button> : null}
        </div>

        {searching ? <Empty icon={<Loader2 className="animate-spin" />} title="Searching Apollo" detail="Finding companies that match your criteria…" theme={theme} />
        : searched && !results.length ? <Empty icon={<Building2 />} title="No companies found" detail="Try broader keywords or a different location." theme={theme} />
        : !searched ? <Empty icon={<Search />} title="Start with the freight market" detail="The default search is preloaded for U.S. freight brokers and freight forwarders." theme={theme} />
        : <div style={{ display: "grid", gap: 8 }}>
            {results.map((company) => {
              const isSelected = selected.has(company.id);
              const isSaved = company.saved || saved.has(company.id);
              const isVerifying = verifying.has(company.id);
              const isBlocked = ["disqualified", "review"].includes(company.qualification_status);
              return <article key={company.id} onClick={() => toggle(company)} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: 14, borderRadius: 12, border: `1px solid ${isSelected ? theme.accentBorder : theme.border}`, background: isSelected ? theme.accentSoft : theme.panel, cursor: isSaved || isBlocked ? "default" : "pointer" }}>
                <CompanyAvatar name={company.name} domain={company.domain} logoUrl={company.logo_url} size="md" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 700, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{company.name}</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4, color: theme.textMuted, fontSize: 12 }}>
                    {company.industry ? <span>{company.industry}</span> : null}
                    {[company.city, company.state, company.country].filter(Boolean).length ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><MapPin size={11} />{[company.city, company.state, company.country].filter(Boolean).join(", ")}</span> : null}
                    {company.employee_count ? <span>{company.employee_count.toLocaleString()} employees</span> : null}
                    {company.domain ? <span>{company.domain}</span> : null}
                    <span style={{ color: company.qualification_status === "qualified" ? "#059669" : company.qualification_status === "disqualified" ? "#dc2626" : theme.textMuted }}>
                      {company.qualification_status === "qualified" ? `Verified · ${Math.round((company.qualification_confidence || 0) * 100)}%`
                        : company.qualification_status === "disqualified" ? "Not a target"
                        : company.qualification_status === "review" ? "Needs review"
                        : "Not verified"}
                    </span>
                  </div>
                </div>
                {isSaved ? <span title={company.saved_status === "deleted" ? "This company was previously saved and later deleted." : undefined} style={{ display: "inline-flex", gap: 5, alignItems: "center", color: "#059669", fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700 }}><Check size={14} /> {company.saved_status === "deleted" ? "Previously saved" : "Saved"}</span>
                : isBlocked ? <span title={company.qualification_reason || undefined} style={{ color: company.qualification_status === "disqualified" ? "#dc2626" : "#d97706", fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700 }}>{company.qualification_status === "disqualified" ? "Excluded" : "Review"}</span>
                : <button onClick={(e) => { e.stopPropagation(); saveCompanies([company.id]); }} disabled={saving || isVerifying} style={secondaryButton(theme)}>
                    {isVerifying ? <Loader2 size={14} className="animate-spin" /> : isSelected ? <Check size={14} /> : <Building2 size={14} />}
                    {isVerifying ? "Verifying" : isSelected ? "Selected" : company.safe_to_enrich ? "Save" : "Verify & save"}
                  </button>}
              </article>;
            })}
          </div>}

        {searched && results.length > 0 ? (
          <nav aria-label="Apollo search result pages" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "20px 0 4px" }}>
            <button
              type="button"
              disabled={searching || pagination.page <= 1}
              onClick={() => runSearch(pagination.page - 1)}
              style={paginationButton(theme, searching || pagination.page <= 1)}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span style={{ minWidth: 92, textAlign: "center", fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, color: theme.textMuted }}>
              Page {pagination.page}{pagination.totalPages ? ` of ${pagination.totalPages}` : ""}
            </span>
            <button
              type="button"
              disabled={searching || (pagination.totalPages != null ? pagination.page >= pagination.totalPages : results.length < pagination.perPage)}
              onClick={() => runSearch(pagination.page + 1)}
              style={paginationButton(theme, searching || (pagination.totalPages != null ? pagination.page >= pagination.totalPages : results.length < pagination.perPage))}
            >
              Next <ChevronRight size={14} />
            </button>
          </nav>
        ) : null}
      </main>
    </div>
  );
}

function Field({ label, children, theme }: any) { return <label style={{ display: "grid", gap: 6 }}><span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: theme.textMuted }}>{label}</span>{children}</label>; }
function Empty({ icon, title, detail, theme }: any) { return <div style={{ padding: "72px 20px", textAlign: "center", border: `1px dashed ${theme.borderStrong}`, borderRadius: 14, color: theme.textMuted }}><div style={{ width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: theme.panelMuted }}>{React.cloneElement(icon, { size: 20 })}</div><div style={{ marginTop: 12, fontFamily: FONT_HEAD, fontWeight: 700, color: theme.heading }}>{title}</div><div style={{ marginTop: 4, fontSize: 13 }}>{detail}</div></div>; }
function inputStyle(theme: any): React.CSSProperties { return { width: "100%", height: 39, borderRadius: 9, border: `1.5px solid ${theme.borderStrong}`, background: theme.inputBg, color: theme.text, padding: "0 11px", outline: "none", fontFamily: FONT_BODY, fontSize: 13 }; }
function primaryButton(theme: any, disabled = false): React.CSSProperties { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", border: 0, borderRadius: 9, background: theme.accent, color: theme.accentText, opacity: disabled ? .5 : 1, cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700 }; }
function secondaryButton(theme: any): React.CSSProperties { return { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 8, border: `1px solid ${theme.borderStrong}`, background: theme.panel, color: theme.text, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, cursor: "pointer" }; }
function paginationButton(theme: any, disabled: boolean): React.CSSProperties { return { display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 9, border: `1px solid ${theme.borderStrong}`, background: theme.panel, color: theme.text, opacity: disabled ? .45 : 1, cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700 }; }
function linkButton(color: string): React.CSSProperties { return { display: "inline-flex", alignItems: "center", gap: 6, border: 0, padding: 0, background: "transparent", color, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, cursor: "pointer" }; }
