import { supabase } from '@/lib/supabase';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeContact(contact, index = 0) {
  return {
    id:
      contact?.id ||
      contact?.prospect_id ||
      contact?.email ||
      contact?.linkedin_url ||
      contact?.full_name ||
      contact?.name ||
      `contact-${index}`,
    full_name: clean(contact?.full_name || contact?.name),
    name: clean(contact?.name || contact?.full_name),
    title: clean(contact?.title || contact?.job_title),
    department: clean(contact?.department || contact?.job_department || contact?.dept),
    email: clean(contact?.email),
    phone: clean(contact?.phone),
    linkedin_url: clean(contact?.linkedin_url || contact?.linkedin_profile || contact?.linkedin),
    enriched: Boolean(contact?.email || contact?.phone),
  };
}

function normalizeCompanyResult(item, index = 0) {
  const contacts = toArray(item?.contacts).map(normalizeContact);
  // Tech stack: Apollo returns this as `tech_stack` (already deduped
  // string[] from our edge fn) or as raw `technologies` / `technology_names`
  // depending on plan / endpoint. Accept any of them.
  const techStack = (() => {
    const candidates = [item?.tech_stack, item?.technology_names, item?.technologies];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length) {
        return c
          .map((t) => (typeof t === 'string' ? t.trim() : (t?.name || t?.uid || '')))
          .filter(Boolean);
      }
    }
    return [];
  })();

  return {
    id: item?.id || item?.business_id || item?.domain || item?.name || `company-${index}`,
    type: 'company',
    business_id: item?.business_id || item?.id || '',
    name: clean(item?.name) || 'Unknown Company',
    domain: clean(item?.domain),
    website: clean(item?.website),
    linkedin_url: clean(item?.linkedin_url || item?.linkedin_profile),
    phone: clean(item?.phone || item?.sanitized_phone),
    city: clean(item?.city || item?.city_name),
    state: clean(item?.state || item?.region),
    country: clean(item?.country || item?.country_name),
    industry:
      clean(
        item?.industry ||
          item?.google_category ||
          item?.linkedin_category ||
          item?.naics_description
      ) || '—',
    employee_count:
      item?.employee_count ||
      item?.number_of_employees_range ||
      item?.company_size ||
      '—',
    annual_revenue:
      item?.annual_revenue ||
      item?.yearly_revenue_range ||
      '—',
    summary: clean(item?.summary || item?.business_description),
    keywords: Array.isArray(item?.keywords) ? item.keywords.filter(Boolean) : [],
    tech_stack: techStack,
    founded_year: item?.founded_year || null,
    status: clean(item?.status) || 'Prospect',
    contacts_count:
      typeof item?.contacts_count === 'number' ? item.contacts_count : contacts.length,
    contacts,
  };
}

function normalizePeopleResult(item, index = 0) {
  return {
    id: item?.id || item?.prospect_id || item?.email || item?.full_name || `person-${index}`,
    type: 'person',
    prospect_id: item?.prospect_id || item?.id || '',
    full_name: clean(item?.full_name || item?.name),
    title: clean(item?.title || item?.job_title),
    department: clean(item?.department || item?.job_department),
    seniority: clean(item?.seniority || item?.job_level),
    email: clean(item?.email),
    phone: clean(item?.phone),
    linkedin_url: clean(item?.linkedin_url || item?.linkedin_profile),
    enriched: Boolean(item?.email || item?.phone),
    company: {
      id: item?.company?.id || item?.business_id || '',
      business_id: item?.company?.business_id || item?.business_id || '',
      name: clean(item?.company?.name || item?.business_name || item?.company_name),
      domain: clean(item?.company?.domain || item?.company_domain || item?.domain),
      website: clean(item?.company?.website || item?.company_website),
      city: clean(item?.company?.city || item?.company_city || item?.city_name),
      state: clean(item?.company?.state || item?.company_region || item?.region),
      country: clean(item?.company?.country || item?.company_country || item?.country_name),
      industry: clean(
        item?.company?.industry || item?.company_industry || item?.naics_description
      ),
      employee_count:
        item?.company?.employee_count || item?.number_of_employees_range || '—',
      annual_revenue:
        item?.company?.annual_revenue || item?.yearly_revenue_range || '—',
      status: clean(item?.company?.status) || 'Prospect',
    },
  };
}

function normalizeResults(mode, rawResults) {
  const rows = toArray(rawResults);

  if (mode === 'people') {
    return rows.map(normalizePeopleResult);
  }

  return rows.map(normalizeCompanyResult);
}

/**
 * Run a Pulse search against the searchLeads edge fn.
 *
 * payload accepts:
 *   - query: string (required) — the user's NL prompt
 *   - ui_mode: 'auto' | 'companies' | 'people' (default 'auto')
 *   - page, pageSize
 *   - entities: ParsedEntities — output from pulseQueryParser +
 *     pulseCoachClassify merged on the client. When supplied, the
 *     edge fn maps these to Apollo's structured filter parameters
 *     (organization_locations[], q_organization_keyword_tags[],
 *     person_titles[], person_seniorities[]) instead of relying on
 *     keyword matching alone.
 */
export async function searchPulse(payload = {}) {
  // Strip client-only fields (raw, source, hasAny, suggested_refinements,
  // clarifying_question) that the edge fn doesn't need. Keep only the
  // structured entity fields we know how to map.
  const cleaned = { ...payload };
  if (cleaned.entities) {
    const e = cleaned.entities;
    cleaned.entities = {
      intent: e.intent,
      direction: e.direction,
      quantity: e.quantity,
      products: Array.isArray(e.products) ? e.products : [],
      industries: Array.isArray(e.industries) ? e.industries : [],
      roles: Array.isArray(e.roles) ? e.roles : [],
      origins: Array.isArray(e.origins) ? e.origins : [],
      destinations: Array.isArray(e.destinations) ? e.destinations : [],
      countries: Array.isArray(e.countries) ? e.countries : [],
      states: Array.isArray(e.states) ? e.states : [],
      metros: Array.isArray(e.metros) ? e.metros : [],
      similarTo: e.similarTo || null,
    };
  }

  const { data, error } = await supabase.functions.invoke('searchLeads', {
    body: cleaned,
  });

  if (error) {
    console.error('[Pulse] searchLeads failed:', error);
    throw new Error(error.message || 'Pulse search failed');
  }

  const raw = data ?? {};
  const mode = raw?.mode || 'companies';
  const normalizedResults = normalizeResults(mode, raw?.data?.results);

  return {
    ok: raw?.ok ?? true,
    mode,
    query: raw?.query || payload?.query || '',
    meta: {
      total:
        typeof raw?.meta?.total === 'number'
          ? raw.meta.total
          : normalizedResults.length,
      page: raw?.meta?.page ?? 1,
      pageSize: raw?.meta?.pageSize ?? normalizedResults.length,
      requestedLimit: raw?.meta?.requestedLimit ?? null,
      estimatedMarketSize: raw?.meta?.estimatedMarketSize ?? null,
      provider: raw?.meta?.provider ?? null,
      partial: Boolean(raw?.meta?.partial),
      warnings: toArray(raw?.meta?.warnings),
      classificationReasons: toArray(raw?.meta?.classificationReasons),
      matchedCompanyName: raw?.meta?.matchedCompanyName ?? null,
    },
    data: {
      results: normalizedResults,
    },
    error: raw?.error ?? null,
  };
}
