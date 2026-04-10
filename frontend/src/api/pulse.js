import { supabase } from '@/lib/supabase';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeContact(contact, fallbackIndex = 0) {
  return {
    id:
      contact?.id ||
      contact?.prospect_id ||
      contact?.email ||
      contact?.linkedin_url ||
      contact?.full_name ||
      contact?.name ||
      `contact-${fallbackIndex}`,
    full_name: contact?.full_name || contact?.name || '',
    name: contact?.name || contact?.full_name || '',
    title: contact?.title || contact?.job_title || '',
    department: contact?.department || contact?.job_department || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    linkedin_url: contact?.linkedin_url || contact?.linkedin_profile || '',
    enriched: Boolean(contact?.email || contact?.phone),
  };
}

function normalizeCompanyResult(item, index = 0) {
  return {
    id: item?.id || item?.business_id || item?.domain || item?.name || `company-${index}`,
    type: 'company',
    business_id: item?.business_id || item?.id || '',
    name: item?.name || 'Unknown Company',
    domain: item?.domain || '',
    website: item?.website || '',
    linkedin_url: item?.linkedin_url || item?.linkedin_profile || '',
    city: item?.city || item?.city_name || '',
    state: item?.state || item?.region || '',
    country: item?.country || item?.country_name || '',
    industry:
      item?.industry ||
      item?.google_category ||
      item?.linkedin_category ||
      item?.naics_description ||
      '',
    employee_count:
      item?.employee_count ||
      item?.number_of_employees_range ||
      item?.company_size ||
      '',
    annual_revenue:
      item?.annual_revenue ||
      item?.yearly_revenue_range ||
      '',
    summary: item?.summary || item?.business_description || '',
    contacts_count:
      typeof item?.contacts_count === 'number'
        ? item.contacts_count
        : ensureArray(item?.contacts).length,
    contacts: ensureArray(item?.contacts).map(normalizeContact),
    signals: item?.signals || {},
  };
}

function normalizePeopleResult(item, index = 0) {
  return {
    id: item?.id || item?.prospect_id || item?.email || item?.full_name || `person-${index}`,
    type: 'person',
    prospect_id: item?.prospect_id || item?.id || '',
    full_name: item?.full_name || item?.name || '',
    title: item?.title || item?.job_title || '',
    department: item?.department || item?.job_department || '',
    seniority: item?.seniority || item?.job_level || '',
    email: item?.email || '',
    phone: item?.phone || '',
    linkedin_url: item?.linkedin_url || item?.linkedin_profile || '',
    enriched: Boolean(item?.email || item?.phone),
    company: {
      id: item?.company?.id || item?.business_id || '',
      business_id: item?.company?.business_id || item?.business_id || '',
      name: item?.company?.name || item?.business_name || item?.company_name || '',
      domain: item?.company?.domain || item?.company_domain || item?.domain || '',
      website: item?.company?.website || item?.company_website || '',
      city: item?.company?.city || item?.company_city || item?.city_name || '',
      state: item?.company?.state || item?.company_region || item?.region || '',
      country: item?.company?.country || item?.company_country || item?.country_name || '',
      industry:
        item?.company?.industry ||
        item?.company_industry ||
        item?.naics_description ||
        '',
      employee_count:
        item?.company?.employee_count ||
        item?.number_of_employees_range ||
        '',
      annual_revenue:
        item?.company?.annual_revenue ||
        item?.yearly_revenue_range ||
        '',
    },
  };
}

function normalizeResultsByMode(mode, rawResults) {
  const results = ensureArray(rawResults);

  if (mode === 'people') {
    return results.map(normalizePeopleResult);
  }

  return results.map(normalizeCompanyResult);
}

export async function searchPulse(payload = {}) {
  const { data, error } = await supabase.functions.invoke('searchLeads', {
    body: payload,
  });

  if (error) {
    console.error('[Pulse] searchLeads failed:', error);
    throw new Error(error.message || 'Pulse search failed');
  }

  const raw = data ?? {};
  const mode = raw?.mode || 'companies';
  const normalizedResults = normalizeResultsByMode(mode === 'hybrid_people_over_company' ? 'companies' : mode, raw?.data?.results);

  return {
    ok: raw?.ok ?? true,
    mode,
    query: raw?.query || payload?.query || '',
    meta: {
      total: raw?.meta?.total ?? normalizedResults.length,
      page: raw?.meta?.page ?? 1,
      pageSize: raw?.meta?.pageSize ?? normalizedResults.length,
      estimatedMarketSize: raw?.meta?.estimatedMarketSize ?? null,
      provider: raw?.meta?.provider ?? 'explorium',
      partial: Boolean(raw?.meta?.partial),
      warnings: ensureArray(raw?.meta?.warnings),
      classificationReasons: ensureArray(raw?.meta?.classificationReasons),
    },
    data: {
      results: normalizedResults,
    },
    error: raw?.error ?? null,
  };
}
