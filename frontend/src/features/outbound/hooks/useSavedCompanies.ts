import { useCallback, useEffect, useState } from "react";
import { getSavedCompanies } from "@/lib/api";

export interface SavedCompanyLite {
  saved_id: string | null;
  company_id: string | null; // canonical lit_companies UUID
  company_key: string | null; // human slug — display only
  name: string;
  domain: string | null;
  location: string;
  stage: string | null;
}

function flatten(row: any): SavedCompanyLite {
  const company = row?.company ?? {};
  const parts: string[] = [];
  if (company.address) parts.push(String(company.address));
  if (company.country_code) parts.push(String(company.country_code));
  return {
    saved_id: row?.saved_id ?? null,
    company_id: company.id ?? null,
    company_key: company.company_id ?? null,
    name: company.name || "Unnamed company",
    domain: company.domain || company.website || null,
    location: parts.join(" · "),
    stage: row?.stage ?? null,
  };
}

export interface UseSavedCompaniesResult {
  companies: SavedCompanyLite[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSavedCompanies(): UseSavedCompaniesResult {
  const [companies, setCompanies] = useState<SavedCompanyLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getSavedCompanies();
      const rows = Array.isArray(resp?.rows)
        ? resp.rows
        : Array.isArray(resp)
        ? resp
        : [];
      const list = rows.map(flatten).filter((c: SavedCompanyLite) => c.company_id);
      setCompanies(list);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load saved companies.";
      setError(msg);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { companies, loading, error, refresh };
}