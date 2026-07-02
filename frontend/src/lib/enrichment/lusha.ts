import type { CompanyCore } from '@/types/company';
import type { ContactCore } from '@/types/contacts';
import {
  enrichContact as enrichViaProviderCascade,
  type EnrichContactParams,
  type EnrichmentResult,
} from './contactEnrichment';
import { supabase } from '@/lib/supabase';

export type { EnrichContactParams, EnrichmentResult };

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
  avatarUrl?: string;
  jobHistory?: Array<{ title?: string; company?: string; startDate?: string; endDate?: string }>;
  education?: Array<{ school?: string; degree?: string; field?: string; startDate?: string; endDate?: string }>;
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

export interface CreditsInfo {
  balance: number;
  used: number;
  limit: number;
}

/**
 * Backward-compatible export. The implementation now uses LIT's configured
 * provider cascade: Lemlist first, Apollo fallback. Lusha is intentionally
 * not part of the active enrichment path.
 */
export async function enrichContact(params: EnrichContactParams): Promise<EnrichmentResult> {
  return enrichViaProviderCascade(params);
}

/**
 * Provider-neutral company contact search. This remains Apollo-backed for
 * discovery because the current product search flow expects immediate people
 * rows; individual profile enrichment is handled by the provider cascade.
 */
export async function searchCompanyContacts(params: SearchContactsParams): Promise<ContactCore[]> {
  const { data, error } = await supabase.functions.invoke('apollo-contact-search', {
    body: {
      domain: params.companyDomain || undefined,
      company_name: params.companyName || undefined,
      departments: params.department ? [params.department] : undefined,
      seniorities: params.seniority ? [params.seniority] : undefined,
      per_page: params.limit || 25,
      page: params.offset && params.limit ? Math.floor(params.offset / params.limit) + 1 : 1,
    },
  });
  if (error) throw new Error(error.message || 'Contact search failed');
  return Array.isArray(data?.contacts) ? data.contacts : [];
}

export async function batchEnrichContacts(contactIds: string[]): Promise<{ results: EnrichmentResult[]; totalCost: number }> {
  const results = await Promise.all(contactIds.map((contactId) => enrichContact({ contactId })));
  return { results, totalCost: 0 };
}

export async function getCreditsBalance(): Promise<CreditsInfo> {
  return { balance: 0, used: 0, limit: 0 };
}

export function estimateEnrichmentCost(_contactCount: number, _hasPartialData = false): number {
  return 0;
}

export function normalizeLushaContact(contact: LushaContact): Partial<ContactCore> {
  return {
    name: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
    fullName: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
    title: contact.title,
    email: contact.email,
    phone: contact.phoneNumber,
    mobile_phone: contact.mobilePhone,
    direct_dial: contact.directDial,
    department: contact.department,
    seniority: contact.seniority,
    location: contact.location,
    linkedin_url: contact.linkedinUrl,
    linkedin: contact.linkedinUrl,
    avatar_url: contact.avatarUrl,
    personal_email: contact.personalEmail,
    job_history: contact.jobHistory,
    education: contact.education,
    source_provider: 'legacy_lusha_payload',
  };
}

export async function enrichCompany(_payload: { company_name?: string; domain?: string }): Promise<CompanyCore> {
  throw new Error('Company enrichment is handled by the company profile enrichment workflow.');
}

export async function enrichContacts(payload: { company_name?: string; domain?: string; role_filters?: string[]; limit?: number }): Promise<ContactCore[]> {
  return searchCompanyContacts({
    companyName: payload.company_name,
    companyDomain: payload.domain,
    limit: payload.limit || 25,
  });
}
