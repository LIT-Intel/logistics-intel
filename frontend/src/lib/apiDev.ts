import {
  getSavedCompaniesFromSupabase,
  saveCompanyToSupabase,
  getCompanyFromSupabase,
  getContactsFromSupabase,
  saveContactToSupabase,
  getCampaignsFromSupabase,
  saveCampaignToSupabase,
  addCompanyToCampaignSupabase,
  getCampaignCompaniesFromSupabase,
} from './supabase';
import {
  SAMPLE_PROFILES,
  SAMPLE_ENRICHMENTS,
  getSampleShipperHits,
  getSampleProfile,
  getSampleRouteKpis,
} from './mockData';
import type { IySearchResponse, IyCompanyProfile } from './api';

// CRITICAL: Mock data mode is DISABLED by default in production
// Only enable explicitly for local testing via VITE_USE_MOCK_DATA=true
const DEV_MODE = import.meta.env.VITE_USE_MOCK_DATA === 'true' && import.meta.env.DEV === true;

if (typeof window !== 'undefined' && DEV_MODE) {
  console.warn('[LIT] 🔧 MOCK DATA MODE ACTIVE - Real API calls are bypassed!');
}

export function isDevMode(): boolean {
  // Mock mode only in local dev, never in production
  return DEV_MODE;
}

export async function devGetSavedCompanies(stage = 'prospect') {
  console.log('[DEV API] Getting saved companies from Supabase');
  return getSavedCompaniesFromSupabase(stage);
}

export async function devSaveCompany(payload: any) {
  console.log('[DEV API] Saving company to Supabase:', payload);

  const companyId = payload.company_id || payload.companyId || payload.company?.company_id;
  const companyData = payload.company || payload.payload || payload;

  if (!companyId) {
    throw new Error('devSaveCompany requires company_id');
  }

  const result = await saveCompanyToSupabase({
    company_id: companyId,
    company_key: companyData.companyKey || companyData.key || companyId,
    company_name: companyData.name || companyData.title || companyData.company_name || 'Unknown Company',
    company_data: companyData,
    stage: payload.stage || 'prospect',
    source: payload.provider || payload.source || 'importyeti',
  });

  return { ok: true, data: result };
}

export async function devGetCompanyDetail(company_id: string) {
  console.log('[DEV API] Getting company detail from Supabase:', company_id);

  const savedCompany = await getCompanyFromSupabase(company_id);

  if (savedCompany) {
    return {
      ok: true,
      company: savedCompany.company_data,
      company_id: savedCompany.company_id,
      created_at: savedCompany.created_at,
    };
  }

  const mockProfile = SAMPLE_PROFILES[company_id];
  if (mockProfile) {
    return {
      ok: true,
      company: mockProfile,
      company_id: company_id,
      created_at: new Date().toISOString(),
    };
  }

  return { ok: false, error: 'Company not found' };
}

export async function devSearchCompanies(payload: any) {
  console.log('[DEV API] Searching companies (mock data)');

  const sampleHits = getSampleShipperHits();
  const limit = Number(payload.limit || 25);
  const offset = Number(payload.offset || 0);

  const results = sampleHits.slice(offset, offset + limit);

  return {
    ok: true,
    results,
    rows: results,
    total: sampleHits.length,
    meta: {
      q: payload.q || '',
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    },
  };
}

export async function devGetCompanyProfile(companyKey: string): Promise<{ companyProfile: IyCompanyProfile; enrichment: any | null }> {
  console.log('[DEV API] Getting company profile (mock):', companyKey);

  const profile = getSampleProfile(companyKey);
  const enrichment = SAMPLE_ENRICHMENTS[companyKey] || null;

  if (!profile) {
    throw new Error('Company profile not found');
  }

  return {
    companyProfile: profile,
    enrichment,
  };
}

export async function devGetCompanyBols(params: any) {
  console.log('[DEV API] Getting company BOLs (mock):', params);

  const mockShipments = generateMockShipments(params.company_id);
  const limit = Number(params.limit || 100);
  const offset = Number(params.offset || 0);

  return {
    ok: true,
    rows: mockShipments.slice(offset, offset + limit),
    total: mockShipments.length,
  };
}

export async function devSearchShippers(params: any): Promise<IySearchResponse> {
  console.log('[DEV API] Searching shippers (mock):', params);

  const sampleHits = getSampleShipperHits();
  const limit = Number(params.pageSize || 25);
  const offset = ((Number(params.page || 1) - 1) * limit);

  const results = sampleHits.slice(offset, offset + limit);

  return {
    ok: true,
    results,
    total: sampleHits.length,
    meta: {
      q: params.q || '',
      page: Number(params.page || 1),
      pageSize: limit,
    },
  };
}

export async function devEnrichContacts(company_id: string) {
  console.log('[DEV API] Enriching contacts (mock):', company_id);

  const mockContacts = generateMockContacts(company_id);

  for (const contact of mockContacts) {
    await saveContactToSupabase({
      company_id,
      contact_name: contact.name,
      contact_title: contact.title,
      contact_email: contact.email,
      contact_phone: contact.phone,
      contact_data: contact,
    });
  }

  return {
    ok: true,
    contacts: mockContacts,
    count: mockContacts.length,
  };
}

export async function devGetContacts(company_id: string) {
  console.log('[DEV API] Getting contacts from Supabase:', company_id);

  const contacts = await getContactsFromSupabase(company_id);

  if (contacts.length === 0) {
    const mockContacts = generateMockContacts(company_id);
    return mockContacts;
  }

  return contacts.map(c => c.contact_data);
}

export async function devGetCampaigns() {
  console.log('[DEV API] Getting campaigns from Supabase');
  return getCampaignsFromSupabase();
}

export async function devCreateCampaign(payload: any) {
  console.log('[DEV API] Creating campaign in Supabase:', payload);
  return saveCampaignToSupabase({
    campaign_name: payload.name || 'New Campaign',
    campaign_type: 'email',
    status: 'draft',
    campaign_data: payload,
  });
}

export async function devAddCompanyToCampaign(params: any) {
  console.log('[DEV API] Adding company to campaign in Supabase:', params);
  return addCompanyToCampaignSupabase({
    campaign_id: String(params.campaign_id),
    company_id: params.company_id,
    status: 'pending',
  });
}

export async function devGetCampaignCompanies(campaign_id: string) {
  console.log('[DEV API] Getting campaign companies from Supabase:', campaign_id);
  return getCampaignCompaniesFromSupabase(campaign_id);
}

export async function devGetRfpContext(company_id: string) {
  console.log('[DEV API] Getting RFP context (mock):', company_id);

  const profile = getSampleProfile(company_id);
  const routeKpis = getSampleRouteKpis(company_id);

  return {
    ok: true,
    company_id,
    company: profile,
    lanes: routeKpis?.topRoutesLast12m || [],
    shipments_12m: routeKpis?.shipmentsLast12m || 0,
  };
}

export async function devGenerateRfp(payload: any) {
  console.log('[DEV API] Generating RFP (mock):', payload);

  return {
    ok: true,
    rfp_id: `mock-rfp-${Date.now()}`,
    file_url: 'https://example.com/mock-rfp.xlsx',
    pdf_url: 'https://example.com/mock-rfp.pdf',
    message: 'RFP generated successfully (mock)',
  };
}

export async function devGetFilterOptions() {
  console.log('[DEV API] Getting filter options (mock)');

  return {
    origins: ['CN', 'US', 'TW', 'KR', 'JP', 'VN', 'IN'],
    destinations: ['US', 'CN', 'EU', 'UK', 'CA', 'MX', 'AU'],
    modes: ['ocean', 'air'],
    hs: ['8471', '8517', '8542', '6203', '9403', '8528'],
  };
}

function generateMockShipments(company_id: string) {
  const routes = [
    { origin: 'Shenzhen, CN', destination: 'Los Angeles, CA', origin_country: 'CN', dest_country: 'US' },
    { origin: 'Shanghai, CN', destination: 'Seattle, WA', origin_country: 'CN', dest_country: 'US' },
    { origin: 'Ningbo, CN', destination: 'Long Beach, CA', origin_country: 'CN', dest_country: 'US' },
    { origin: 'Yantian, CN', destination: 'Oakland, CA', origin_country: 'CN', dest_country: 'US' },
  ];

  const shipments = [];
  const now = new Date();

  for (let i = 0; i < 50; i++) {
    const route = routes[i % routes.length];
    const date = new Date(now);
    date.setDate(date.getDate() - (i * 7));

    shipments.push({
      bol: `BOL${String(i + 1000).padStart(6, '0')}`,
      date: date.toISOString().split('T')[0],
      shipped_on: date.toISOString().split('T')[0],
      mode: 'ocean',
      origin_port: route.origin,
      destination_port: route.destination,
      origin_country_code: route.origin_country,
      dest_country_code: route.dest_country,
      carrier: ['MAERSK', 'MSC', 'CMA CGM', 'COSCO', 'EVERGREEN'][i % 5],
      teu: Math.floor(Math.random() * 40) + 10,
      container_count: Math.floor(Math.random() * 5) + 1,
      value_usd: Math.floor(Math.random() * 50000) + 10000,
      weight_kg: Math.floor(Math.random() * 20000) + 5000,
    });
  }

  return shipments;
}

function generateMockContacts(company_id: string) {
  const companyProfile = SAMPLE_PROFILES[company_id];
  const companyName = companyProfile?.name || 'Unknown Company';
  const domain = companyProfile?.domain || 'example.com';

  return [
    {
      name: 'John Smith',
      title: 'VP of Supply Chain',
      email: `john.smith@${domain}`,
      phone: '+1-555-0101',
      department: 'Supply Chain',
      seniority: 'VP',
      company: companyName,
    },
    {
      name: 'Sarah Johnson',
      title: 'Director of Logistics',
      email: `sarah.johnson@${domain}`,
      phone: '+1-555-0102',
      department: 'Logistics',
      seniority: 'Director',
      company: companyName,
    },
    {
      name: 'Michael Chen',
      title: 'Logistics Manager',
      email: `michael.chen@${domain}`,
      phone: '+1-555-0103',
      department: 'Logistics',
      seniority: 'Manager',
      company: companyName,
    },
    {
      name: 'Emily Rodriguez',
      title: 'Procurement Manager',
      email: `emily.rodriguez@${domain}`,
      phone: '+1-555-0104',
      department: 'Procurement',
      seniority: 'Manager',
      company: companyName,
    },
  ];
}
