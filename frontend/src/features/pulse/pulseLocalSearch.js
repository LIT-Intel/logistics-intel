// Cache-first cascade for Pulse.
//
// Before hitting any remote provider, look the query up against the local
// `lit_companies` table. Any rows we already own are free to surface and
// give the user immediate signal. The remote search (searchPulse) still
// runs in parallel — its results are merged after, deduped on domain.
//
// READ-ONLY against lit_companies. Pulse never writes here; the existing
// freight-data ingestion owns this table.

import { supabase } from '@/lib/supabase';

// Pull the keyword-ish tokens out of a NL query so we can run a tolerant
// ILIKE lookup. We intentionally drop common filler words ("companies",
// "in", "from") — the tokens that survive are usually brand fragments,
// industries, or place names that can match name/city/state/industry.
const STOPWORDS = new Set([
  'a','an','and','any','are','as','at','be','by','companies','company','find',
  'for','from','give','have','i','in','is','it','large','list','me','near',
  'of','or','show','similar','some','that','the','their','to','top','us','use',
  'who','with','top-50','50','100','500','1000','want','need','looking','show me',
]);

function tokenize(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t && t.length > 2 && !STOPWORDS.has(t));
}

// Build an OR clause across name/city/state/country/industry-ish fields.
// Each token is wrapped in % wildcards so partial matches survive.
function buildOrFilter(tokens) {
  if (!tokens.length) return null;
  const cols = ['name', 'city', 'state', 'country_code', 'address_line1', 'domain'];
  const parts = [];
  for (const t of tokens) {
    const safe = t.replace(/[%,]/g, ' ');
    for (const c of cols) parts.push(`${c}.ilike.%${safe}%`);
  }
  return parts.join(',');
}

/**
 * Cache-first lookup. Returns normalized result rows shaped to match what
 * searchPulse returns from the remote provider, so the UI can merge both
 * lists without a second adapter.
 *
 * Each row carries `provenance: 'database'` so the UI can paint the
 * "In your database" badge — and a populated `kpis` block when the
 * underlying lit_companies row has freight numbers.
 */
export async function searchLocalCompanies(query, limit = 12) {
  const tokens = tokenize(query);
  if (!tokens.length) return { rows: [], tokens };

  const orFilter = buildOrFilter(tokens);
  if (!orFilter) return { rows: [], tokens };

  try {
    const { data, error } = await supabase
      .from('lit_companies')
      .select(`
        id,
        source_company_key,
        name,
        domain,
        website,
        phone,
        address_line1,
        city,
        state,
        country_code,
        shipments_12m,
        teu_12m,
        fcl_shipments_12m,
        lcl_shipments_12m,
        est_spend_12m,
        most_recent_shipment_date,
        top_route_12m,
        recent_route
      `)
      .or(orFilter)
      .order('shipments_12m', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.warn('[Pulse] local cache lookup failed:', error.message);
      return { rows: [], tokens };
    }

    const rows = (data || []).map(normalizeLocalRow);
    return { rows, tokens };
  } catch (err) {
    console.warn('[Pulse] local cache lookup threw:', err);
    return { rows: [], tokens };
  }
}

function normalizeLocalRow(row) {
  return {
    id: row.id || row.source_company_key,
    type: 'company',
    business_id: row.source_company_key || row.id || '',
    name: row.name || 'Unknown Company',
    domain: row.domain || '',
    website: row.website || '',
    phone: row.phone || '',
    city: row.city || '',
    state: row.state || '',
    country: row.country_code || '',
    industry: '',
    employee_count: '—',
    annual_revenue: '—',
    summary: '',
    status: 'In database',
    contacts_count: 0,
    contacts: [],
    provenance: 'database',
    kpis: {
      shipments_12m: row.shipments_12m ?? null,
      teu_12m: row.teu_12m ?? null,
      fcl_shipments_12m: row.fcl_shipments_12m ?? null,
      lcl_shipments_12m: row.lcl_shipments_12m ?? null,
      est_spend_12m: row.est_spend_12m ?? null,
      top_route_12m: row.top_route_12m ?? null,
      recent_route: row.recent_route ?? null,
      most_recent_shipment_date: row.most_recent_shipment_date ?? null,
    },
  };
}

/**
 * Merge local + remote results. Local hits come first (free + richer for
 * us). Remote rows get tagged `provenance: 'live'` if they came back fresh,
 * deduped against locals on domain (case-insensitive).
 */
export function mergeResults(localRows, remoteRows) {
  const seen = new Set();
  const out = [];

  for (const row of localRows) {
    const key = (row.domain || row.name || row.id).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  for (const row of remoteRows) {
    const key = (row.domain || row.name || row.id || '').toLowerCase();
    if (!key) {
      out.push({ ...row, provenance: row.provenance || 'live' });
      continue;
    }
    if (seen.has(key)) {
      // Local already covers it — annotate the local row with both flags
      // so the badge can show "In database · Verified".
      const idx = out.findIndex((r) => (r.domain || r.name || r.id).toLowerCase() === key);
      if (idx >= 0) out[idx] = { ...out[idx], alsoLive: true };
      continue;
    }
    seen.add(key);
    out.push({ ...row, provenance: row.provenance || 'live' });
  }

  return out;
}
