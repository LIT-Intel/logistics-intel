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

  return {
    id: item?.id || item?.business_id || item?.domain || item?.name || `company-${index}`,
    type: 'company',
    business_id: item?.business_id || item?.id || '',
    name: clean(item?.name) || 'Unknown Company',
    domain: clean(item?.domain),
    website: clean(item?.website),
    linkedin_url: clean(item?.linkedin_url || item?.linkedin_profile),
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
      provider: raw?.meta?.provider ?? 'explorium',
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
