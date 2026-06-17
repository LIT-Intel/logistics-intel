// Client for the pulse-explore-parse edge fn.
// POST { query } → { ok, parsed: ExplorerFilters, model }

import { supabase } from '@/lib/supabase';

export async function parseExploreQuery(query) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pulse-explore-parse`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`pulse-explore-parse ${r.status}`);
  return await r.json();
}

// Last-resort: when the LLM parse extracted nothing useful AND the query
// looks like a company brand (short, mostly letters/spaces, not a known
// filter phrase), treat the raw text as a company-name search. Lets
// "Walmart" / "Q Cells" / "Tesla" work even when the LLM is cold or down.
const NAME_KILL_PHRASES = [
  'incumbent','vulnerable','consolidat','high-velocity','high velocity',
  'defend','grow','book','stale','live data','top mover','importer','exporter',
  'shipper','forwarder','teu','spend','revenue','manufacturer','retailer',
  'food and beverage','automotive','electronics','industry','vertical','metro',
  'state','country','region','coast','southeast','northeast','midwest','southwest',
];
export function looksLikeCompanyName(query) {
  const q = String(query ?? '').trim();
  if (!q || q.length > 80) return false;
  const lower = q.toLowerCase();
  if (NAME_KILL_PHRASES.some((p) => lower.includes(p))) return false;
  // Mostly letters / spaces / common brand punctuation, not a phrase
  // with prepositions / commas.
  if (/[,;]| in | from | with | above | below | under /.test(` ${lower} `)) return false;
  return /^[A-Za-z][A-Za-z0-9 .,&'\-_/]{1,79}$/.test(q);
}


// Map the edge fn's parsed payload to the Filters shape that pulse-explore
// accepts. Keeps the contract narrow even if the edge fn returns extras.
export function parsedToFilters(parsed) {
  if (!parsed) return {};
  const out = {};
  if (parsed.name?.trim()) out.name = parsed.name.trim();
  if (parsed.industry?.length) out.industry = parsed.industry;
  const geo = {};
  // New shape: regions[]. Legacy single `region` still accepted as a
  // fallback if the edge fn ever returns the old shape.
  if (parsed.geo?.regions?.length) geo.regions = parsed.geo.regions;
  else if (parsed.geo?.region) geo.regions = [parsed.geo.region];
  if (parsed.geo?.states?.length) geo.states = parsed.geo.states;
  if (parsed.geo?.countries?.length) geo.countries = parsed.geo.countries;
  if (Object.keys(geo).length) out.geo = geo;
  const size = {};
  for (const k of ['teu_min','teu_max','shipments_min','shipments_max','spend_min','spend_max']) {
    if (parsed.size?.[k] != null) size[k] = parsed.size[k];
  }
  if (Object.keys(size).length) out.size = size;
  if (parsed.opportunity_types?.length) out.opportunity_types = parsed.opportunity_types;
  if (parsed.freshness_state?.length) out.freshness_state = parsed.freshness_state;
  if (parsed.workflow_state?.length) out.workflow_state = parsed.workflow_state;
  if (parsed.dataset_filter && parsed.dataset_filter !== 'all') out.dataset_filter = parsed.dataset_filter;
  return out;
}

export function hasAnyFilter(filters) {
  if (!filters || Object.keys(filters).length === 0) return false;
  if (filters.name?.trim()) return true;
  if (filters.industry?.length) return true;
  if (filters.geo && (filters.geo.regions?.length || filters.geo.region || filters.geo.states?.length || filters.geo.countries?.length)) return true;
  if (filters.size && Object.values(filters.size).some((v) => v != null)) return true;
  if (filters.opportunity_types?.length) return true;
  if (filters.freshness_state?.length) return true;
  if (filters.workflow_state?.length) return true;
  if (filters.dataset_filter && filters.dataset_filter !== 'all') return true;
  return false;
}
