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

// Map the edge fn's parsed payload to the Filters shape that pulse-explore
// accepts. Keeps the contract narrow even if the edge fn returns extras.
export function parsedToFilters(parsed) {
  if (!parsed) return {};
  const out = {};
  if (parsed.industry?.length) out.industry = parsed.industry;
  const geo = {};
  if (parsed.geo?.region) geo.region = parsed.geo.region;
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
  if (filters.industry?.length) return true;
  if (filters.geo && (filters.geo.region || filters.geo.states?.length || filters.geo.countries?.length)) return true;
  if (filters.size && Object.values(filters.size).some((v) => v != null)) return true;
  if (filters.opportunity_types?.length) return true;
  if (filters.freshness_state?.length) return true;
  if (filters.workflow_state?.length) return true;
  if (filters.dataset_filter && filters.dataset_filter !== 'all') return true;
  return false;
}
