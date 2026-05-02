// Pulse Library — read-only helpers for the user's Pulse-saved companies.
//
// Pulse keeps its saved-companies view scoped separately from Command
// Center (which is freight / Search-saved). The split is virtual, not
// physical: companies live in the same lit_companies table, but Pulse
// rows carry source='pulse' (set by the save-company edge fn via the
// company_data.source field that Pulse always sends). This avoids
// duplicating data while keeping the UX scoped — and never touches
// the freight ingestion path or its tables.

import { supabase } from '@/lib/supabase';

/**
 * Returns the current user's Pulse-discovered, Pulse-saved companies.
 * Joins lit_saved_companies (per-user save record) → lit_companies
 * (canonical row) and filters on source='pulse' so Search-saved /
 * freight-ingested companies stay out of the Pulse Library.
 */
export async function getPulseSavedCompanies() {
  try {
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp?.user) return { rows: [] };

    const { data, error } = await supabase
      .from('lit_saved_companies')
      .select(`
        id,
        stage,
        created_at,
        last_viewed_at,
        lit_companies!inner (
          id,
          source,
          source_company_key,
          name,
          domain,
          website,
          phone,
          city,
          state,
          country_code,
          shipments_12m,
          teu_12m,
          est_spend_12m,
          most_recent_shipment_date,
          top_route_12m
        )
      `)
      .eq('user_id', userResp.user.id)
      .eq('lit_companies.source', 'pulse')
      .order('last_viewed_at', { ascending: false, nullsFirst: false })
      .limit(120);

    if (error) {
      console.warn('[Pulse] library fetch failed:', error.message);
      return { rows: [] };
    }

    const rows = (data || [])
      .map((row) => {
        const c = row.lit_companies;
        if (!c) return null;
        return {
          saved_id: row.id,
          saved_at: row.created_at,
          last_viewed_at: row.last_viewed_at,
          stage: row.stage || 'prospect',
          id: c.id,
          name: c.name || 'Unknown Company',
          domain: c.domain || '',
          website: c.website || '',
          phone: c.phone || '',
          city: c.city || '',
          state: c.state || '',
          country: c.country_code || '',
          source: 'pulse',
          kpis: {
            shipments_12m: c.shipments_12m ?? null,
            teu_12m: c.teu_12m ?? null,
            est_spend_12m: c.est_spend_12m ?? null,
            most_recent_shipment_date: c.most_recent_shipment_date ?? null,
            top_route_12m: c.top_route_12m ?? null,
          },
          provenance: 'database',
        };
      })
      .filter(Boolean);

    return { rows };
  } catch (err) {
    console.warn('[Pulse] library fetch threw:', err);
    return { rows: [] };
  }
}

/**
 * Client-side filter for the library — supports a free-text query plus
 * structured location filters. Kept here so the Library component is
 * pure presentational.
 */
export function filterLibrary(rows, { query, country, state, city }) {
  let out = rows;
  if (query) {
    const q = query.toLowerCase();
    out = out.filter((r) =>
      [r.name, r.domain, r.city, r.state, r.country]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }
  if (country) out = out.filter((r) => (r.country || '').toLowerCase() === country.toLowerCase());
  if (state) out = out.filter((r) => (r.state || '').toLowerCase() === state.toLowerCase());
  if (city) out = out.filter((r) => (r.city || '').toLowerCase() === city.toLowerCase());
  return out;
}

export function uniqueValues(rows, key) {
  const set = new Set();
  for (const r of rows) {
    const v = r[key];
    if (v && String(v).trim()) set.add(String(v).trim());
  }
  return Array.from(set).sort();
}
