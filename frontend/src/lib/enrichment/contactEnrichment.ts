import { supabase } from '@/lib/supabase';
import type { ContactCore } from '@/types/contacts';

export interface EnrichContactParams {
  contactId?: string;
  email?: string;
  fullName?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  title?: string;
}

export interface EnrichmentResult {
  success: boolean;
  pending?: boolean;
  provider?: string | null;
  submitted?: number;
  jobs?: Array<{ id?: string; provider_request_id?: string; status?: string }>;
  contact?: Partial<ContactCore>;
  fieldsAdded?: string[];
  cost?: number;
  error?: string;
}

function splitName(fullName?: string) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || undefined, last_name: parts.slice(1).join(' ') || undefined };
}

function toContactPayload(params: EnrichContactParams) {
  const names = splitName(params.fullName);
  return {
    id: params.contactId,
    name: params.fullName,
    full_name: params.fullName,
    first_name: names.first_name,
    last_name: names.last_name,
    email: params.email,
    linkedin_url: params.linkedinUrl,
    title: params.title,
    company_name: params.companyName,
    organization_name: params.companyName,
    domain: params.companyDomain,
  };
}

export async function enrichContact(params: EnrichContactParams): Promise<EnrichmentResult> {
  const { data, error } = await supabase.functions.invoke('enrich-contact-orchestrator', {
    body: {
      contact: toContactPayload(params),
      company_name: params.companyName,
      domain: params.companyDomain,
      source_context: 'command_center_contact_drawer',
      source_entity_type: 'lit_contact',
      source_entity_id: params.contactId,
      enrichment_requests: ['find_email', 'find_phone', 'verify', 'linkedin_enrichment'],
      reveal_phone_number: true,
    },
  });

  if (error) {
    let parsed: any = null;
    try { parsed = await error.context?.clone?.().json?.(); } catch { parsed = null; }
    return { success: false, error: parsed?.error || parsed?.message || error.message || 'Enrichment failed' };
  }

  if (!data?.ok) {
    return { success: false, provider: data?.provider ?? null, error: data?.error || data?.message || 'Enrichment failed' };
  }

  if (data.pending) {
    return {
      success: true,
      pending: true,
      provider: data.provider,
      submitted: data.submitted || 0,
      jobs: Array.isArray(data.jobs) ? data.jobs : [],
      fieldsAdded: ['enrichment job submitted'],
      cost: 0,
    };
  }

  const contact = Array.isArray(data.contacts) && data.contacts.length ? data.contacts[0] : null;
  return {
    success: true,
    provider: data.provider,
    contact: contact || undefined,
    fieldsAdded: contact ? Object.keys(contact).filter((key) => contact[key] != null) : [],
    cost: 0,
  };
}
