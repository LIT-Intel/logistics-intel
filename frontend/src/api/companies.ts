/**
 * Companies domain — save, profile, export.
 *
 * `save-company` is the canonical save path (writes `lit_saved_companies`).
 * Free-trial save cap = 10 enforced server-side. Admin bypass is server-side
 * only. See CLAUDE.md.
 */
import { invokeEdge } from "./_client";

export interface SaveCompanyRequest {
  company_id?: string;
  source_company_key?: string;
  company_data?: Record<string, unknown>;
}

export interface SaveCompanyResponse {
  ok: boolean;
  saved_id?: string;
  already_saved?: boolean;
  limit_reached?: boolean;
  error?: string;
  code?: string;
}

export interface CompanyProfileRequest {
  company_id?: string;
  slug?: string;
  source_company_key?: string;
}

export interface CompanyProfileResponse {
  ok: boolean;
  profile?: unknown;
  shipments?: unknown[];
  contacts?: unknown[];
  error?: string;
}

export interface ExportCompanyProfileRequest {
  company_id?: string;
  slug?: string;
  format?: "pdf" | "xlsx" | "json";
}

export interface ExportCompanyProfileResponse {
  ok: boolean;
  url?: string;
  data?: unknown;
  error?: string;
}

/** Save a company to the user's command center. */
export async function saveCompany(
  req: SaveCompanyRequest,
): Promise<SaveCompanyResponse> {
  return invokeEdge<SaveCompanyResponse>("save-company", req);
}

/** Load a company profile snapshot (header + supply chain + contacts). */
export async function loadCompanyProfile(
  req: CompanyProfileRequest,
): Promise<CompanyProfileResponse> {
  return invokeEdge<CompanyProfileResponse>("company-profile", req);
}

/** Export a company profile to PDF / XLSX / JSON. */
export async function exportCompanyProfile(
  req: ExportCompanyProfileRequest,
): Promise<ExportCompanyProfileResponse> {
  return invokeEdge<ExportCompanyProfileResponse>("export-company-profile", req);
}
