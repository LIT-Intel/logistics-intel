// Pulse signals — small derived/fetched data points the Quick Card
// surfaces alongside the freight KPIs. Two flavors:
//
//   1. computeVolumeSignal(kpis)
//      Pure-function tier from shipments_12m + recent activity.
//      Replaces the old "Year-over-year growth" row, which we cannot
//      honestly compute without prior-period snapshot data.
//
//   2. fetchHiringSignal(orgId)
//      Calls the apollo-job-postings edge fn for an Apollo org id
//      (lit_companies.source_company_key for Pulse-discovered rows).
//      Returns { total, departments[], most_recent_posted_at, freshness }.
//
// Both helpers are vendor-neutral on the surface — call sites should
// not render "Apollo" or any provider name.

import { supabase } from '@/lib/supabase';

/* ─── Volume signal ─── */

export function computeVolumeSignal(kpis) {
  const shipments = Number(kpis?.shipments_12m || 0);
  const teu = Number(kpis?.teu_12m || 0);
  const recentDate = kpis?.most_recent_shipment_date;

  if (!shipments) return null;

  // Tier — based on industry-wide bands typical for ocean freight
  // shippers. These are deliberately conservative so even mid-volume
  // accounts get a meaningful tier.
  let tier = 'small';
  if (shipments >= 5000) tier = 'enterprise';
  else if (shipments >= 1500) tier = 'large';
  else if (shipments >= 400) tier = 'mid';
  else if (shipments >= 100) tier = 'small';
  else tier = 'emerging';

  // Activity recency — how long since the last shipment
  let activity = 'unknown';
  if (recentDate) {
    const ageDays = (Date.now() - new Date(recentDate).getTime()) / 86400000;
    if (ageDays < 14) activity = 'active';
    else if (ageDays < 60) activity = 'recent';
    else if (ageDays < 180) activity = 'slowing';
    else activity = 'dormant';
  }

  const labelMap = {
    enterprise: 'Enterprise volume',
    large: 'Large shipper',
    mid: 'Mid-market shipper',
    small: 'Small shipper',
    emerging: 'Emerging shipper',
  };

  return {
    tier,
    activity,
    shipments,
    teu,
    label: labelMap[tier] || 'Shipper',
    accent: tier === 'enterprise' ? 'green' : tier === 'large' ? 'blue' : 'slate',
  };
}

/* ─── Hiring signal ─── */

const HIRING_CACHE_PREFIX = 'lit.pulse.hiring.v1.';
const HIRING_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function readHiringCache(orgId) {
  try {
    const raw = window.localStorage.getItem(HIRING_CACHE_PREFIX + orgId);
    if (!raw) return null;
    const { at, signal } = JSON.parse(raw);
    if (!at || !signal) return null;
    if (Date.now() - at > HIRING_TTL_MS) return null;
    return signal;
  } catch {
    return null;
  }
}

function writeHiringCache(orgId, signal) {
  try {
    window.localStorage.setItem(
      HIRING_CACHE_PREFIX + orgId,
      JSON.stringify({ at: Date.now(), signal }),
    );
  } catch {
    // ignore quota errors
  }
}

/**
 * Fetch the hiring signal for an Apollo organization id. The orgId
 * is the same value Pulse stores as `business_id` / `source_company_key`
 * for Pulse-discovered rows. Cached client-side for 12h to avoid
 * hammering the upstream when users open the same Quick Card twice.
 *
 * Returns:
 *   { ok: true, signal: { total, departments[], most_recent_posted_at, freshness, sample[] } }
 *   { ok: false, code, message }
 */
export async function fetchHiringSignal(orgId) {
  if (!orgId) return { ok: false, code: 'MISSING_ORG_ID' };

  const cached = readHiringCache(orgId);
  if (cached) return { ok: true, cached: true, signal: cached };

  try {
    const { data, error } = await supabase.functions.invoke('apollo-job-postings', {
      body: { org_id: orgId },
    });
    if (error) {
      // Pull structured body out of the FunctionsHttpError when present
      let parsed = null;
      try {
        const cloned = error?.context?.clone?.();
        parsed = await cloned?.json?.();
      } catch {
        parsed = null;
      }
      const code = parsed?.code || 'NETWORK';
      const message = parsed?.message || error.message || 'Hiring signal fetch failed.';
      return { ok: false, code, message };
    }
    if (!data?.ok) {
      return {
        ok: false,
        code: data?.code || 'PROVIDER_ERROR',
        message: data?.message || 'Hiring signal unavailable.',
      };
    }
    const signal = {
      total: data.total ?? 0,
      departments: Array.isArray(data.departments) ? data.departments : [],
      most_recent_posted_at: data.most_recent_posted_at ?? null,
      freshness: data.freshness || 'unknown',
      sample: Array.isArray(data.sample) ? data.sample : [],
    };
    writeHiringCache(orgId, signal);
    return { ok: true, cached: false, signal };
  } catch (err) {
    return {
      ok: false,
      code: 'NETWORK',
      message: err?.message || 'Hiring signal network error.',
    };
  }
}

/* ─── Decision makers (Apollo contact search) ─── */

const DM_CACHE_PREFIX = 'lit.pulse.dm.v1.';
const DM_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function dmCacheKey(company) {
  // Stable key — domain wins, falls back to lower-cased name
  const k = (company?.domain || company?.name || '').toLowerCase().trim();
  return DM_CACHE_PREFIX + k;
}

function readDmCache(company) {
  try {
    const raw = window.localStorage.getItem(dmCacheKey(company));
    if (!raw) return null;
    const { at, contacts } = JSON.parse(raw);
    if (!at || !Array.isArray(contacts)) return null;
    if (Date.now() - at > DM_TTL_MS) return null;
    return contacts;
  } catch {
    return null;
  }
}

function writeDmCache(company, contacts) {
  try {
    window.localStorage.setItem(
      dmCacheKey(company),
      JSON.stringify({ at: Date.now(), contacts }),
    );
  } catch {
    // ignore quota
  }
}

// Default decision-maker seniority scope. Caller can override via
// options.seniorities to broaden ("manager") or narrow ("c_suite").
export const DEFAULT_DM_SENIORITIES = [
  'c_suite', 'founder', 'owner', 'partner', 'vp', 'head', 'director',
];

/**
 * Find decision makers AT a company via Apollo's contact search.
 * Pre-filters seniorities to c-suite + VP + Director by default so the
 * rail doesn't get flooded with low-signal hits. Cached per-company
 * for 6h — repeat opens of the same Quick Card don't burn credits.
 *
 * options:
 *   force        — bypass localStorage cache (true on user "Re-fetch")
 *   titles       — exact-or-similar job titles to require
 *   seniorities  — override default scope (e.g. add 'manager')
 *   departments  — narrow by department (e.g. ['supply_chain'])
 *
 * When ANY of titles/seniorities/departments differs from defaults,
 * cache is bypassed entirely (filtered queries shouldn't share cache
 * with the default-scope query).
 *
 * Returns:
 *   { ok: true, contacts: [...], cached: bool }
 *   { ok: false, code, message }
 */
export async function fetchDecisionMakers(company, options = {}) {
  if (!company?.domain && !company?.name) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Need a domain or name.' };
  }
  const { force = false } = options;
  const titles = Array.isArray(options.titles) ? options.titles.filter(Boolean) : [];
  const seniorities = Array.isArray(options.seniorities) && options.seniorities.length
    ? options.seniorities
    : DEFAULT_DM_SENIORITIES;
  const departments = Array.isArray(options.departments)
    ? options.departments.filter(Boolean)
    : [];
  const useDefaultScope =
    titles.length === 0 &&
    departments.length === 0 &&
    seniorities === DEFAULT_DM_SENIORITIES;

  // Cache only the default-scope query. Custom-filter queries always
  // hit Apollo so the user gets fresh results matching their filters.
  if (!force && useDefaultScope) {
    const cached = readDmCache(company);
    if (cached) return { ok: true, cached: true, contacts: cached };
  }

  try {
    const { data, error } = await supabase.functions.invoke('apollo-contact-search', {
      body: {
        domain: company.domain || undefined,
        company_name: company.name || undefined,
        city: company.city || undefined,
        state: company.state || undefined,
        country: company.country || undefined,
        seniorities,
        ...(titles.length ? { titles, include_similar_titles: true } : {}),
        ...(departments.length ? { departments } : {}),
        // Reasonable page size — we only render top ~10 in the rail
        per_page: 25,
        page: 1,
      },
    });
    if (error) {
      let parsed = null;
      try {
        const cloned = error?.context?.clone?.();
        parsed = await cloned?.json?.();
      } catch { parsed = null; }
      return {
        ok: false,
        code: parsed?.code || 'NETWORK',
        message: parsed?.message || parsed?.error || error.message || 'Lookup failed.',
      };
    }
    if (!data?.ok) {
      return {
        ok: false,
        code: data?.code || 'PROVIDER_ERROR',
        message: data?.message || data?.error || 'Lookup failed.',
      };
    }
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];
    // Only cache the default-scope query so custom-filter queries
    // don't pollute the cache key for the next default open.
    if (useDefaultScope) writeDmCache(company, contacts);
    return { ok: true, cached: false, contacts };
  } catch (err) {
    return {
      ok: false,
      code: 'NETWORK',
      message: err?.message || 'Decision-maker lookup network error.',
    };
  }
}

/** Cheap formatter for "12 open roles · Engineering · 3d ago" */
export function summarizeHiring(signal) {
  if (!signal || !signal.total) return null;
  const parts = [`${signal.total} open role${signal.total === 1 ? '' : 's'}`];
  if (signal.departments?.[0]?.name) {
    const top = signal.departments[0].name;
    parts.push(top);
  }
  if (signal.most_recent_posted_at) {
    const ageDays = Math.floor(
      (Date.now() - new Date(signal.most_recent_posted_at).getTime()) / 86400000,
    );
    if (ageDays < 1) parts.push('today');
    else if (ageDays < 7) parts.push(`${ageDays}d ago`);
    else if (ageDays < 60) parts.push(`${Math.floor(ageDays / 7)}w ago`);
    else parts.push(`${Math.floor(ageDays / 30)}mo ago`);
  }
  return parts.join(' · ');
}
