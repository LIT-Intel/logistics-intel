import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { normalizeDirectoryForwarders, type ForwarderEvidence } from "@/lib/harvey/forwarderEvidence";

type DirectoryRow = {
  id: string;
  company_name: string | null;
  canonical_name: string | null;
  website: string | null;
  domain: string | null;
  source: string | null;
  source_file: string | null;
  updated_at: string | null;
  top_forwarders: unknown;
};
export type CompanyForwarderSummary = {
  companyName: string;
  source: string;
  sourceFile: string | null;
  sourceUpdatedAt: string | null;
  relationshipScope: "company_history_unspecified";
  entries: ForwarderEvidence[];
  matchMethod: "company_domain" | "unique_canonical_name";
};
export function canonicalDirectoryName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|sas|gmbh)$/i, "")
    .replace(/[.,'"!?()]/g,"")
    .replace(/\s+/g," ").trim();
}
export function normalizeHost(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);
    return parsed.hostname.toLowerCase().replace(/^www\./,"")||null;
  } catch { return null; }
}
export function selectDirectoryRow(rows: DirectoryRow[], name: string, website?: string | null): {row:DirectoryRow;matchMethod:CompanyForwarderSummary["matchMethod"]}|null {
  const targetHost=normalizeHost(website);
  if (targetHost) {
    const domainMatches=rows.filter(r=>normalizeHost(r.website)===targetHost||normalizeHost(r.domain)===targetHost);
    if (domainMatches.length===1) return {row:domainMatches[0],matchMethod:"company_domain"};
  }
  // A canonical-name match only counts when it identifies exactly one record.
  // Do not blend same-name entities from unrelated states or legal parents.
  const desired=canonicalDirectoryName(name);
  const names=rows.filter(r=>canonicalDirectoryName(r.company_name||r.canonical_name||"")===desired);
  if (names.length===1) {
    const record=names[0];
    // Reject a matching name with a known conflicting website.
    const recordHost=normalizeHost(record.website)||normalizeHost(record.domain);
    if (targetHost && recordHost && targetHost!==recordHost) return null;
    return {row:record,matchMethod:"unique_canonical_name"};
  }
  return null;
}
/** Query is on-demand and separately cached: it never blocks Profile's shipment render. */
export async function loadCompanyForwarderEvidence(companyName:string,website?:string|null):Promise<CompanyForwarderSummary|null>{
  const canonical=canonicalDirectoryName(companyName);
  if (!canonical || canonical.length>180 || canonical==="company") return null;
  const targetHost=normalizeHost(website);
  const {data,error}=await supabase.from("lit_company_directory")
    .select("id,company_name,canonical_name,website,domain,source,source_file,updated_at,top_forwarders")
    .eq("canonical_name",canonical).limit(8);
  if (error) throw error;
  let candidates=(data||[]) as DirectoryRow[];
  if (!candidates.length && targetHost) {
    // Directory CSV preserves the company website in https://www.example.com/
    // format; these are exact variants, not expensive fuzzy name searches.
    const forms=[
      `https://www.${targetHost}/`,
      `https://${targetHost}/`,
      `https://www.${targetHost}`,
      `https://${targetHost}`,
    ];
    const bySite=await supabase.from("lit_company_directory")
      .select("id,company_name,canonical_name,website,domain,source,source_file,updated_at,top_forwarders")
      .in("website",forms).limit(8);
    if (bySite.error) throw bySite.error;
    candidates=(bySite.data||[]) as DirectoryRow[];
  }
  const selected=selectDirectoryRow(candidates,companyName,website);
  if (!selected) return null;
  const row=selected.row;
  return {
    companyName:row.company_name||companyName,
    source:row.source||"directory",
    sourceFile:row.source_file||null,
    sourceUpdatedAt:row.updated_at||null,
    relationshipScope:"company_history_unspecified",
    entries:normalizeDirectoryForwarders(row.top_forwarders),
    matchMethod:selected.matchMethod,
  };
}
export function useCompanyForwarderEvidence(companyName:string,website?:string|null){
  return useQuery({
    queryKey:["company-forwarder-evidence",canonicalDirectoryName(companyName),normalizeHost(website)],
    queryFn:()=>loadCompanyForwarderEvidence(companyName,website),
    enabled:Boolean(canonicalDirectoryName(companyName))&&companyName!=="Company",
    staleTime:10*60*1000,
    gcTime:30*60*1000,
    retry:1,
  });
}
