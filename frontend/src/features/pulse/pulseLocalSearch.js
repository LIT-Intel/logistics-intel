// Cache-first cascade for Pulse — now reads from THREE local sources before
// falling back to the remote provider:
//
//   1. `lit_companies`            — curated app accounts (saved/enriched)
//   2. `lit_company_directory`    — the wider firmographic index (12K+ rows)
//   3. `lit_company_source_metrics` — joined to the directory by company_key
//                                     for shipment volume / TEU / value KPIs
//
// Order of precedence on dedupe: lit_companies > directory. Both feed into
// the same normalized shape, so the UI doesn't have to branch.
//
// READ-ONLY everywhere. Writes back into the directory (when remote
// results land new companies) are deferred to a server-side path so we
// don't bake a write-policy hole into the RLS rules.

import { supabase } from '@/lib/supabase';

// Stopwords stripped before token-matching local rows.
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

function buildOrFilter(tokens, cols) {
  if (!tokens.length) return null;
  const parts = [];
  for (const t of tokens) {
    const safe = t.replace(/[%,]/g, ' ');
    for (const c of cols) parts.push(`${c}.ilike.%${safe}%`);
  }
  return parts.join(',');
}

// Threshold for skipping the remote provider entirely. When the merged
// local result set is at or above this, Pulse can answer from owned data
// alone — Pulse.jsx reads `localRichEnough` to decide.
export const LOCAL_RICH_THRESHOLD = 10;

/**
 * Cache-first lookup. Queries `lit_companies` AND `lit_company_directory`
 * in parallel, joins shipment metrics from `lit_company_source_metrics`,
 * dedupes on (canonical_domain || domain || normalized_name), and returns
 * a merged result list shaped like the remote provider's output.
 */
export async function searchLocalCompanies(query, limit = 12, recipe = null) {
  const tokens = tokenize(query);
  if (!tokens.length) return { rows: [], tokens };

  const [companies, directory] = await Promise.all([
    queryLitCompanies(tokens, recipe, limit),
    queryDirectoryWithMetrics(tokens, recipe, limit),
  ]);

  // Merge — `lit_companies` wins on overlap (app-curated rows have
  // saved-account context, attached contacts, etc.). Dedupe key is
  // domain-first, falling back to a normalized name token.
  const seen = new Set();
  const out = [];
  for (const row of [...companies, ...directory]) {
    const key = (row.domain || row.name || row.id || '')
      .toLowerCase()
      .replace(/^www\./, '')
      .trim();
    if (!key) {
      out.push(row);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return { rows: out, tokens };
}

async function queryLitCompanies(tokens, recipe, limit) {
  const orFilter = buildOrFilter(tokens, [
    'name', 'city', 'state', 'country_code', 'address_line1', 'domain',
  ]);
  if (!orFilter) return [];
  try {
    let q = supabase
      .from('lit_companies')
      .select(`
        id, source_company_key, name, domain, website, phone,
        address_line1, city, state, country_code,
        shipments_12m, teu_12m, fcl_shipments_12m, lcl_shipments_12m,
        est_spend_12m, most_recent_shipment_date, top_route_12m, recent_route
      `)
      .or(orFilter);
    if (recipe?.countries?.length) q = q.in('country_code', recipe.countries);
    if (recipe?.states?.length) q = q.in('state', recipe.states);
    const { data, error } = await q
      .order('shipments_12m', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.warn('[Pulse] lit_companies lookup failed:', error.message);
      return [];
    }
    return (data || []).map(normalizeCompanyRow);
  } catch (err) {
    console.warn('[Pulse] lit_companies lookup threw:', err);
    return [];
  }
}

async function queryDirectoryWithMetrics(tokens, recipe, limit) {
  // Directory is a U.S. shipper / importer index — `industry` is null on
  // every row and `country` is always 'United States'. Filter only on
  // columns that carry actual data to keep the OR filter cheap and
  // signal-y. State + city DO have values per row, so they stay.
  const orFilter = buildOrFilter(tokens, [
    'company_name', 'normalized_name', 'canonical_name',
    'domain', 'canonical_domain', 'city', 'state',
  ]);
  if (!orFilter) return [];

  // Pull a slightly larger directory slice so we can filter + join cleanly
  // before trimming to `limit`. The whole table is ~12K rows so this
  // stays cheap.
  const PAGE = Math.max(limit * 3, 30);

  let directoryRows = [];
  try {
    let q = supabase
      .from('lit_company_directory')
      .select(`
        id, company_key, canonical_name, canonical_domain,
        company_name, normalized_name, domain, website, phone,
        city, state, country, industry, employee_count, revenue,
        linkedin_url, description, is_enriched
      `)
      .or(orFilter);
    if (recipe?.countries?.length) {
      q = q.in('country', recipe.countries);
    }
    if (recipe?.states?.length) {
      q = q.in('state', recipe.states);
    }
    const { data, error } = await q.limit(PAGE);
    if (error) {
      console.warn('[Pulse] directory lookup failed:', error.message);
      return [];
    }
    directoryRows = data || [];
  } catch (err) {
    console.warn('[Pulse] directory lookup threw:', err);
    return [];
  }

  if (directoryRows.length === 0) return [];

  // Pull source-metrics rows in one query keyed by company_key. Aggregate
  // multiple source rows (e.g. ImportYeti + manual import) by summing.
  const keys = Array.from(
    new Set(directoryRows.map((r) => r.company_key).filter(Boolean)),
  );
  const metricsByKey = new Map();
  if (keys.length > 0) {
    try {
      const { data, error } = await supabase
        .from('lit_company_source_metrics')
        .select('company_key, shipments, kg, value_usd, teu, lcl, source, dataset_label')
        .in('company_key', keys);
      if (!error) {
        for (const row of data || []) {
          const k = row.company_key;
          if (!k) continue;
          const cur = metricsByKey.get(k) || {
            shipments: 0, kg: 0, value_usd: 0, teu: 0, lcl: 0, sources: new Set(),
          };
          cur.shipments += Number(row.shipments) || 0;
          cur.kg += Number(row.kg) || 0;
          cur.value_usd += Number(row.value_usd) || 0;
          cur.teu += Number(row.teu) || 0;
          cur.lcl += Number(row.lcl) || 0;
          if (row.source) cur.sources.add(row.source);
          metricsByKey.set(k, cur);
        }
      }
    } catch (err) {
      console.warn('[Pulse] source-metrics lookup threw:', err);
    }
  }

  // Sort directory rows by total shipments desc so "top N" answers stay
  // ranked when the recipe doesn't already do so.
  const decorated = directoryRows
    .map((row) => {
      const m = metricsByKey.get(row.company_key);
      return { row, metrics: m, score: m?.shipments ?? 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return decorated.map(({ row, metrics }) =>
    normalizeDirectoryRow(row, metrics),
  );
}

function normalizeCompanyRow(row) {
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

function normalizeDirectoryRow(row, metrics) {
  const name = row.canonical_name || row.company_name || row.normalized_name || 'Unknown Company';
  const domain = (row.canonical_domain || row.domain || '').replace(/^www\./, '');
  return {
    id: row.id,
    type: 'company',
    business_id: row.company_key || row.id,
    name,
    domain,
    website: row.website || '',
    phone: row.phone || '',
    city: row.city || '',
    state: row.state || '',
    country: row.country || '',
    industry: row.industry || '',
    employee_count: row.employee_count || '—',
    annual_revenue: row.revenue || '—',
    summary: row.description || '',
    status: 'In directory',
    contacts_count: 0,
    contacts: [],
    linkedin_url: row.linkedin_url || null,
    provenance: 'directory',
    kpis: metrics
      ? {
          shipments_12m: metrics.shipments || null,
          teu_12m: metrics.teu || null,
          fcl_shipments_12m: null,
          lcl_shipments_12m: metrics.lcl || null,
          est_spend_12m: metrics.value_usd || null,
          top_route_12m: null,
          recent_route: null,
          most_recent_shipment_date: null,
          sources: Array.from(metrics.sources || []),
        }
      : {
          shipments_12m: null, teu_12m: null, fcl_shipments_12m: null,
          lcl_shipments_12m: null, est_spend_12m: null,
          top_route_12m: null, recent_route: null,
          most_recent_shipment_date: null, sources: [],
        },
  };
}

/**
 * Merge local + remote results. Local hits come first (free + richer for
 * us). Remote rows are tagged `provenance: 'live'` and deduped against
 * locals on domain (case-insensitive, with `www.` stripped).
 */
export function mergeResults(localRows, remoteRows) {
  const seen = new Set();
  const out = [];

  function keyFor(row) {
    return (row.domain || row.name || row.id || '')
      .toLowerCase()
      .replace(/^www\./, '')
      .trim();
  }

  for (const row of localRows) {
    const key = keyFor(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  for (const row of remoteRows) {
    const key = keyFor(row);
    if (!key) {
      out.push({ ...row, provenance: row.provenance || 'live' });
      continue;
    }
    if (seen.has(key)) {
      // Local already covers it — annotate so the badge can show
      // "In database · Verified" or "In directory · Verified".
      const idx = out.findIndex((r) => keyFor(r) === key);
      if (idx >= 0) out[idx] = { ...out[idx], alsoLive: true };
      continue;
    }
    seen.add(key);
    out.push({ ...row, provenance: row.provenance || 'live' });
  }

  return out;
}
