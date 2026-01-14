import { supabase } from "@/lib/supabase";

const API_BASE = "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`,
  };
}

export async function searchShippers(query: string, page = 1, pageSize = 25) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/importyeti/searchShippers`, {
    method: "POST",
    headers,
    body: JSON.stringify({ q: query, page, pageSize }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Search failed: ${response.status}`);
  }

  return response.json();
}

export async function getCompanyProfile(companyId: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(
    `${API_BASE}/importyeti/companyProfile?company_id=${encodeURIComponent(companyId)}`,
    { method: "POST", headers }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Profile fetch failed: ${response.status}`);
  }

  return response.json();
}

export async function getCompanyBols(
  companyId: string,
  limit = 25,
  offset = 0,
  startDate?: string,
  endDate?: string
) {
  const headers = await getAuthHeaders();

  const body: any = { company_id: companyId, limit, offset };
  if (startDate) body.start_date = startDate;
  if (endDate) body.end_date = endDate;

  const response = await fetch(`${API_BASE}/importyeti/companyBols`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `BOLs fetch failed: ${response.status}`);
  }

  return response.json();
}

export async function getCompanyStats(companyId: string, range?: string) {
  const headers = await getAuthHeaders();

  const params = new URLSearchParams({ company: companyId });
  if (range) params.set("range", range);

  const response = await fetch(
    `${API_BASE}/importyeti/companyStats?${params.toString()}`,
    { method: "POST", headers }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Stats fetch failed: ${response.status}`);
  }

  return response.json();
}

export async function enrichCompanyWithGemini(
  companyId: string,
  enrichmentTypes: string[] = ["summary", "insights"]
) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/enrichment/gemini`, {
    method: "POST",
    headers,
    body: JSON.stringify({ company_id: companyId, enrichment_types: enrichmentTypes }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Enrichment failed: ${response.status}`);
  }

  return response.json();
}

export async function enrichContactsWithLusha(
  companyId: string,
  options?: {
    domain?: string;
    linkedin_url?: string;
    first_name?: string;
    last_name?: string;
    title?: string;
  }
) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/enrichment/lusha`, {
    method: "POST",
    headers,
    body: JSON.stringify({ company_id: companyId, ...options }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Contact enrichment failed: ${response.status}`);
  }

  return response.json();
}

export async function getSavedCompanies() {
  const { data, error } = await supabase
    .from("saved_companies")
    .select(`
      *,
      companies:company_id (*)
    `)
    .order("saved_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function saveCompany(companyId: string, companyData: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("companies")
    .upsert({
      company_id: companyId,
      company_key: companyData.key || companyId,
      company_name: companyData.title || companyData.name || "Unknown",
      domain: companyData.domain,
      country_code: companyData.countryCode,
      address: companyData.address,
      phone: companyData.phone,
      website: companyData.website,
      shipments_12m: companyData.totalShipments || 0,
      total_shipments: companyData.totalShipments || 0,
      most_recent_shipment: companyData.mostRecentShipment,
      top_suppliers: companyData.topSuppliers || [],
      raw_data: companyData,
      source: "importyeti",
      last_fetched_at: new Date().toISOString(),
    }, { onConflict: "company_id" });

  const { data: saved, error } = await supabase
    .from("saved_companies")
    .upsert({
      user_id: user.id,
      company_id: companyId,
      stage: "prospect",
      saved_at: new Date().toISOString(),
      last_viewed_at: new Date().toISOString(),
    }, { onConflict: "user_id,company_id" })
    .select()
    .single();

  if (error) throw error;

  enrichCompanyWithGemini(companyId).catch(err => {
    console.warn("Background enrichment failed:", err);
  });

  return saved;
}

export async function removeSavedCompany(companyId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("saved_companies")
    .delete()
    .eq("user_id", user.id)
    .eq("company_id", companyId);

  if (error) throw error;
  return { ok: true };
}

export async function getCompanyContacts(companyId: string) {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getCompanyEnrichment(companyId: string, enrichmentType?: string) {
  let query = supabase
    .from("company_enrichment")
    .select("*")
    .eq("company_id", companyId);

  if (enrichmentType) {
    query = query.eq("enrichment_type", enrichmentType);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getCompanyFromCache(companyId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
