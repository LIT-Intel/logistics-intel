import type { CompanyCore } from '@/types/company';
import type { ContactCore } from '@/types/contacts';

const GW = (import.meta as any).env?.VITE_LIT_GATEWAY_BASE || '';
const API_BASE = import.meta.env.VITE_API_BASE || '/api/lit';
const LUSHA_API_KEY = import.meta.env.VITE_LUSHA_API_KEY || '';

// Lusha API types
export interface LushaContact {
  id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  title?: string;
  email?: string;
  phoneNumber?: string;
  mobilePhone?: string;
  directDial?: string;
  department?: string;
  seniority?: string;
  location?: string;
  linkedinUrl?: string;
  personalEmail?: string;
  jobHistory?: Array<{
    title?: string;
    company?: string;
    startDate?: string;
    endDate?: string;
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    field?: string;
    startDate?: string;
    endDate?: string;
  }>;
}

export interface EnrichContactParams {
  contactId?: string;
  email?: string;
  fullName?: string;
  companyName?: string;
  companyDomain?: string;
}

export interface SearchContactsParams {
  companyName?: string;
  companyDomain?: string;
  department?: string;
  seniority?: string;
  location?: string;
  limit?: number;
  offset?: number;
}

export interface EnrichmentResult {
  success: boolean;
  contact?: ContactCore;
  fieldsAdded?: string[];
  cost?: number;
  error?: string;
}

export interface CreditsInfo {
  balance: number;
  used: number;
  limit: number;
}

/**
 * Enrich a single contact with Lusha data
 */
export async function enrichContact(params: EnrichContactParams): Promise<EnrichmentResult> {
  try {
    const response = await fetch(`${API_BASE}/contacts/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LUSHA_API_KEY}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Enrichment failed' }));
      throw new Error(error.message || `Enrichment failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      contact: data.contact,
      fieldsAdded: data.fieldsAdded || [],
      cost: data.cost || 1,
    };
  } catch (error) {
    console.error('Lusha enrichContact error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Enrichment failed',
    };
  }
}

/**
 * Batch enrich multiple contacts
 */
export async function batchEnrichContacts(
  contactIds: string[]
): Promise<{ results: EnrichmentResult[]; totalCost: number }> {
  try {
    const response = await fetch(`${API_BASE}/contacts/enrich/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LUSHA_API_KEY}`,
      },
      body: JSON.stringify({ contactIds }),
    });

    if (!response.ok) {
      throw new Error(`Batch enrichment failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      results: data.results || [],
      totalCost: data.totalCost || 0,
    };
  } catch (error) {
    console.error('Lusha batchEnrichContacts error:', error);
    throw error;
  }
}

/**
 * Search for contacts at a company using Lusha
 */
export async function searchCompanyContacts(
  params: SearchContactsParams
): Promise<ContactCore[]> {
  try {
    const queryParams = new URLSearchParams();
    if (params.companyName) queryParams.set('companyName', params.companyName);
    if (params.companyDomain) queryParams.set('companyDomain', params.companyDomain);
    if (params.department) queryParams.set('department', params.department);
    if (params.seniority) queryParams.set('seniority', params.seniority);
    if (params.location) queryParams.set('location', params.location);
    if (params.limit) queryParams.set('limit', String(params.limit));
    if (params.offset) queryParams.set('offset', String(params.offset));

    const response = await fetch(`${API_BASE}/contacts/search?${queryParams.toString()}`, {
      headers: {
        'Authorization': `Bearer ${LUSHA_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Contact search failed: ${response.status}`);
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (error) {
    console.error('Lusha searchCompanyContacts error:', error);
    throw error;
  }
}

/**
 * Get current user's enrichment credits balance
 */
export async function getCreditsBalance(): Promise<CreditsInfo> {
  try {
    const response = await fetch(`${API_BASE}/credits/balance`, {
      headers: {
        'Authorization': `Bearer ${LUSHA_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch credits: ${response.status}`);
    }

    const data = await response.json();
    return {
      balance: data.balance || 0,
      used: data.used || 0,
      limit: data.limit || 0,
    };
  } catch (error) {
    console.error('getCreditsBalance error:', error);
    return {
      balance: 0,
      used: 0,
      limit: 0,
    };
  }
}

/**
 * Estimate enrichment cost for multiple contacts
 */
export function estimateEnrichmentCost(contactCount: number, hasPartialData: boolean = false): number {
  // Lusha typically charges 1 credit per full enrichment, 0.5 for partial
  const costPerContact = hasPartialData ? 0.5 : 1;
  return Math.ceil(contactCount * costPerContact);
}

/**
 * Normalize Lusha contact data to our ContactCore format
 */
export function normalizeLushaContact(lushaContact: LushaContact): Partial<ContactCore> {
  return {
    name: lushaContact.fullName || `${lushaContact.firstName || ''} ${lushaContact.lastName || ''}`.trim(),
    title: lushaContact.title,
    email: lushaContact.email,
    phone: lushaContact.phoneNumber,
    mobile_phone: lushaContact.mobilePhone,
    direct_dial: lushaContact.directDial,
    department: lushaContact.department,
    seniority: lushaContact.seniority,
    location: lushaContact.location,
    linkedin_url: lushaContact.linkedinUrl,
    personal_email: lushaContact.personalEmail,
    job_history: lushaContact.jobHistory,
    education: lushaContact.education,
    lusha_id: lushaContact.id,
  };
}

// Legacy functions for backward compatibility
export async function enrichCompany(payload: { company_name?: string; domain?: string }): Promise<CompanyCore> {
  throw new Error('enrichCompany not yet implemented - use company profile enrichment instead');
}

export async function enrichContacts(payload: {
  company_name?: string;
  domain?: string;
  role_filters?: string[];
  limit?: number;
}): Promise<ContactCore[]> {
  return searchCompanyContacts({
    companyName: payload.company_name,
    companyDomain: payload.domain,
    limit: payload.limit || 25,
  });
}
