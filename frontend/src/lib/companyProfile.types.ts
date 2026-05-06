/**
 * Phase 1 — Shared types for the Company Profile data layer.
 *
 * One CompanyEntity per company, merged from up to five sources:
 *   - lit_saved_companies (per-user CRM record, identity wins on conflict)
 *   - lit_companies (canonical KPI + identity cache)
 *   - lit_importyeti_company_snapshot (shipment system-of-record)
 *   - lit_company_directory (Panjiva/manual ingest, 12,749 rows)
 *   - lit_company_source_metrics (Panjiva metrics rollups, 20,000 rows)
 *
 * resolved_via tells the UI which match strategy succeeded so debug
 * tooling and "Source" pills can reflect provenance honestly.
 */

export type ResolvedVia =
  | "uuid"
  | "company_key"
  | "canonical_domain"
  | "name_city_state"
  | "name_country"
  | "directory_id";

export type CompanyDisplay = {
  name: string;
  domain: string | null;
  website: string | null;
  phone: string | null;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    country_code: string | null;
    postal_code: string | null;
  };
  industry: string | null;
  headcount: string | null;
  revenue: string | null;
  logo_url: string | null;
};

export type CompanySources = {
  saved: {
    present: boolean;
    stage?: string | null;
    notes?: string | null;
    last_viewed_at?: string | null;
    last_activity_at?: string | null;
    gemini_brief?: unknown;
    gemini_brief_updated_at?: string | null;
  };
  importyeti: {
    present: boolean;
    updated_at?: string | null;
    is_stale?: boolean;
  };
  directory: {
    present: boolean;
    source?: string | null;
    enrichment_status?: string | null;
    enriched_at?: string | null;
  };
  metrics: {
    shipments_12m: number | null;
    teu_12m: number | null;
    fcl_shipments_12m: number | null;
    lcl_shipments_12m: number | null;
    est_spend_12m: number | null;
    last_shipment: string | null;
    top_route: string | null;
    primary_mode: string | null;
  };
  contacts: {
    count: number;
    saved_count: number;
  };
};

export type CompanyEntity = {
  id: string | null;
  key: string | null;
  display: CompanyDisplay;
  sources: CompanySources;
  resolved_via: ResolvedVia;
};

export type CompanyEvent = {
  type:
    | "shipment"
    | "contact_enriched"
    | "campaign_added"
    | "email_sent"
    | "email_opened"
    | "email_clicked"
    | "email_replied"
    | "note"
    | "crm_stage"
    | "pulse_generated"
    | "export"
    | "list_added"
    | "company_saved"
    | "company_refreshed"
    | "other";
  at: string;
  actor:
    | { kind: "user"; user_id: string; name?: string | null }
    | { kind: "system" };
  title: string;
  description?: string | null;
  payload?: Record<string, unknown>;
  source_table:
    | "lit_activity_events"
    | "lit_email_messages"
    | "lit_email_threads";
};

export type ProfileShipments = {
  monthly: Array<{ month: string; shipments: number; teu: number }>;
  top_routes: Array<{ origin: string; destination: string; teu: number; shipments: number }>;
  top_origins: Array<{ country: string; shipments: number }>;
  top_destinations: Array<{ port: string; shipments: number }>;
  recent_bols: Array<Record<string, unknown>>;
};

export type ProfileContact = {
  id: string;
  full_name: string | null;
  title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  source: string | null;
  enriched_at: string | null;
  is_verified: boolean;
};

export type PulseBriefBundle = {
  brief: unknown | null;
  cached_at: string | null;
  is_stale: boolean;
  source: "saved_company_cache" | "local_synthesis" | "fresh" | "none";
};

export type ProfileBundle = {
  identity: CompanyEntity;
  shipments: ProfileShipments | null;
  contacts: { items: ProfileContact[]; count: number; saved_count: number } | null;
  activity: { events: CompanyEvent[]; next_cursor: string | null } | null;
  pulse: PulseBriefBundle | null;
};

export type ResolveCompanyError = {
  code:
    | "INVALID_INPUT"
    | "COMPANY_NOT_FOUND"
    | "RESOLUTION_AMBIGUOUS"
    | "INTERNAL_ERROR";
  message: string;
  hint?: string;
};

export type ProfileFetchResult =
  | { ok: true; data: ProfileBundle }
  | { ok: false; error: ResolveCompanyError };
