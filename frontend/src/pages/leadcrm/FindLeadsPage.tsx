"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, Building2, Check, Loader2, MapPin, Search, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { createLead } from "@/api/leadCrm";
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
};

const DEFAULT_KEYWORDS = "freight broker, freight forwarder";

export default function FindLeadsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [location, setLocation] = useState("United States");
  const [results, setResults] = useState<ApolloCompany[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searched, setSearched] = useState(false);

  const selectableIds = useMemo(() => results.filter((r) => !saved.has(r.id)).map((r) => r.id), [results, saved]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  async function runSearch() {
    if (!keywords.trim()) return;
    setSearching(true);
    setSearched(true);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("lead-crm-find-leads", {
        body: { keywords: keywords.split(",").map((v) => v.trim()).filter(Boolean), location: location.trim() || null, page: 1, per_page: 50 },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Apollo search failed");
      setResults(Array.isArray(data.companies) ? data.companies : []);
    } catch (error: any) {
      setResults([]);
      toast({ title: "Search failed", description: error?.message || "Could not search Apollo.", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  function toggle(id: string) {
    if (saved.has(id)) return;
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function saveCompanies(ids: string[]) {
    const companies = results.filter((company) => ids.includes(company.id) && !saved.has(company.id));
    if (!companies.length) return;
    setSaving(true);
    let success = 0;
    const completed = new Set<string>();
    for (const company of companies) {
      try {
        const result = await createLead({ companyName: company.name, notes: `Imported from Apollo${company.domain ? ` · ${company.domain}` : ""}` });
        if (result.ok) { success += 1; completed.add(company.id); }
      } catch { /* Continue bulk import and report the partial result. */ }
    }
    setSaved((current) => new Set([...current, ...completed]));
    setSelected((current) => new Set([...current].filter((id) => !completed.has(id))));
    setSaving(false);
    toast({
      title: success === companies.length ? "Leads saved" : "Import finished",
      description: `${success} of ${companies.length} ${companies.length === 1 ? "company" : "companies"} added to the Lead CRM.`,
      variant: success === 0 ? "destructive" : undefined,
    });
  }

  return (
    <div
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
          <button disabled={searching || !keywords.trim()} onClick={runSearch} style={{ ...primaryButton(theme, searching || !keywords.trim()), alignSelf: "end", height: 39 }}>
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Search Apollo
          </button>
        </section>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px", minHeight: 28 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: theme.heading }}>{searched ? `${results.length} companies found` : "Ready to search"}</div>
          {results.length > 0 ? <button onClick={() => setSelected(allSelected ? new Set() : new Set(selectableIds))} style={linkButton(theme.accent)}>{allSelected ? "Clear selection" : "Select all"}</button> : null}
        </div>

        {searching ? <Empty icon={<Loader2 className="animate-spin" />} title="Searching Apollo" detail="Finding companies that match your criteria…" theme={theme} />
        : searched && !results.length ? <Empty icon={<Building2 />} title="No companies found" detail="Try broader keywords or a different location." theme={theme} />
        : !searched ? <Empty icon={<Search />} title="Start with the freight market" detail="The default search is preloaded for U.S. freight brokers and freight forwarders." theme={theme} />
        : <div style={{ display: "grid", gap: 8 }}>
            {results.map((company) => {
              const isSelected = selected.has(company.id); const isSaved = saved.has(company.id);
              return <article key={company.id} onClick={() => toggle(company.id)} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: 14, borderRadius: 12, border: `1px solid ${isSelected ? theme.accentBorder : theme.border}`, background: isSelected ? theme.accentSoft : theme.panel, cursor: isSaved ? "default" : "pointer" }}>
                <CompanyAvatar company={{ name: company.name, domain: company.domain, logo_url: company.logo_url }} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 700, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{company.name}</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4, color: theme.textMuted, fontSize: 12 }}>
                    {company.industry ? <span>{company.industry}</span> : null}
                    {[company.city, company.state, company.country].filter(Boolean).length ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><MapPin size={11} />{[company.city, company.state, company.country].filter(Boolean).join(", ")}</span> : null}
                    {company.employee_count ? <span>{company.employee_count.toLocaleString()} employees</span> : null}
                    {company.domain ? <span>{company.domain}</span> : null}
                  </div>
                </div>
                {isSaved ? <span style={{ display: "inline-flex", gap: 5, alignItems: "center", color: "#059669", fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700 }}><Check size={14} /> Saved</span>
                : <button onClick={(e) => { e.stopPropagation(); saveCompanies([company.id]); }} disabled={saving} style={secondaryButton(theme)}>{isSelected ? <Check size={14} /> : <Building2 size={14} />} {isSelected ? "Selected" : "Save"}</button>}
              </article>;
            })}
          </div>}
      </main>
    </div>
  );
}

function Field({ label, children, theme }: any) { return <label style={{ display: "grid", gap: 6 }}><span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: theme.textMuted }}>{label}</span>{children}</label>; }
function Empty({ icon, title, detail, theme }: any) { return <div style={{ padding: "72px 20px", textAlign: "center", border: `1px dashed ${theme.borderStrong}`, borderRadius: 14, color: theme.textMuted }}><div style={{ width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: theme.panelMuted }}>{React.cloneElement(icon, { size: 20 })}</div><div style={{ marginTop: 12, fontFamily: FONT_HEAD, fontWeight: 700, color: theme.heading }}>{title}</div><div style={{ marginTop: 4, fontSize: 13 }}>{detail}</div></div>; }
function inputStyle(theme: any): React.CSSProperties { return { width: "100%", height: 39, borderRadius: 9, border: `1.5px solid ${theme.borderStrong}`, background: theme.inputBg, color: theme.text, padding: "0 11px", outline: "none", fontFamily: FONT_BODY, fontSize: 13 }; }
function primaryButton(theme: any, disabled = false): React.CSSProperties { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", border: 0, borderRadius: 9, background: theme.accent, color: theme.accentText, opacity: disabled ? .5 : 1, cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700 }; }
function secondaryButton(theme: any): React.CSSProperties { return { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 8, border: `1px solid ${theme.borderStrong}`, background: theme.panel, color: theme.text, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, cursor: "pointer" }; }
function linkButton(color: string): React.CSSProperties { return { display: "inline-flex", alignItems: "center", gap: 6, border: 0, padding: 0, background: "transparent", color, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, cursor: "pointer" }; }
