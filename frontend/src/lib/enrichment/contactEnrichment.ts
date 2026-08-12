import { supabase } from '@/lib/supabase';
import type { ContactCore } from '@/types/contacts';

export interface EnrichContactParams {
  contactId?: string;
  /** Apollo person id (24-char hex) when the contact came from
   *  apollo-contact-search. People/match with { id } is Apollo's most
   *  reliable path — name-only matching returns stub records without
   *  emails. */
  apolloPersonId?: string | null;
  /** lit_contacts.source_contact_key — holds the Apollo person id for
   *  contacts saved from Apollo search results. */
  sourceContactKey?: string | null;
  email?: string;
  fullName?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  title?: string;
  revealPhoneNumber?: boolean;
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

// Apollo person ids are 24-char hex (Mongo ObjectId shape). Never send
// LIT UUIDs as apollo ids — the edge fn guards too, but filter here so
// the payload stays honest.
const APOLLO_ID_SHAPE = /^[0-9a-f]{24}$/i;

function toContactPayload(params: EnrichContactParams) {
  const names = splitName(params.fullName);
  const apolloPersonId = [params.apolloPersonId, params.sourceContactKey]
    .map((v) => (v ? String(v) : ''))
    .find((v) => APOLLO_ID_SHAPE.test(v));
  return {
    id: params.contactId,
    apollo_person_id: apolloPersonId || undefined,
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
  const revealPhoneNumber = params.revealPhoneNumber === true;
  const enrichmentRequests = revealPhoneNumber
    ? ['find_email', 'find_phone', 'verify']
    : ['find_email', 'verify'];

  const { data, error } = await supabase.functions.invoke('enrich-contact-orchestrator', {
    body: {
      contact: toContactPayload(params),
      company_name: params.companyName,
      domain: params.companyDomain,
      source_context: revealPhoneNumber
        ? 'command_center_contact_phone_unlock'
        : 'command_center_contact_email_enrichment',
      source_entity_type: 'lit_contact',
      source_entity_id: params.contactId,
      enrichment_requests: enrichmentRequests,
      reveal_phone_number: revealPhoneNumber,
      // No provider_order override: the orchestrator resolves it from
      // lit_org_enrichment_settings (currently apollo → lemlist). The old
      // hardcoded ['lemlist','apollo'] here silently overrode org config
      // and kept Lemlist primary even after the Apollo restore.
    },
  });

  if (error) {
    let parsed: any = null;
    try { parsed = await error.context?.clone?.().json?.(); } catch { parsed = null; }
    return { success: false, error: parsed?.error || parsed?.message || error.message || 'Enrichment failed' };
  }

  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

  if (!data?.ok) {
    return {
      success: false,
      provider: data?.provider ?? null,
      jobs,
      error: data?.error || data?.message || 'Enrichment failed',
    };
  }

  const contact = Array.isArray(data.contacts) && data.contacts.length ? data.contacts[0] : null;
  const hasAcceptedJob = jobs.some((job) => {
    const status = String(job?.status || '').toLowerCase();
    return Boolean(job?.id || job?.provider_request_id || /pending|queued|submitted|processing|running/.test(status));
  });

  if ((data.pending || hasAcceptedJob || Number(data.submitted || 0) > 0) && !contact) {
    return {
      success: true,
      pending: true,
      provider: data.provider,
      submitted: data.submitted || 0,
      jobs,
      fieldsAdded: ['enrichment job submitted'],
      cost: 0,
    };
  }

  if (!contact) {
    const firstError = Array.isArray(data.errors) && data.errors.length
      ? data.errors[0]?.error || data.errors[0]?.message
      : null;
    return {
      success: false,
      provider: data.provider ?? null,
      jobs,
      error: firstError || data.error || data.message || 'No enrichment result was returned.',
    };
  }

  return {
    success: true,
    provider: data.provider,
    pending: data.pending === true,
    contact: contact || undefined,
    fieldsAdded: contact ? Object.keys(contact).filter((key) => contact[key] != null) : [],
    cost: 0,
  };
}
