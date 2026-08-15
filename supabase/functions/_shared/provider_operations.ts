// Phase 2A: canonical provider operation + trigger-type constants.
//
// The Phase 2B provider gateway (and every edge function that writes to
// `provider_usage_events`) MUST use these constants instead of bare strings so
// operation names line up 1:1 with the `provider_pricing` seed rows and the
// ledger stays queryable. Adding a new operation here means you must also add a
// matching `provider_pricing` row (see migration provider_pricing_config).
//
// Consumed by: Phase 2B gateway. Do not import provider SDKs here — constants only.

/** Canonical provider operation names. Mirror the `provider_pricing.operation` seed. */
export const PROVIDER_OPERATIONS = {
  COMPANY_SEARCH: "company_search",
  COMPANY_LOOKUP: "company_lookup",
  SHIPMENT_HISTORY: "shipment_history",
  DEEP_HISTORY: "deep_history",
  PULSE_REFRESH: "pulse_refresh",
  LANE_REFRESH: "lane_refresh",
  COMPANY_REFRESH: "company_refresh",
  CONTACT_ENRICHMENT: "contact_enrichment",
  OTHER: "other",
} as const;

export type ProviderOperation =
  (typeof PROVIDER_OPERATIONS)[keyof typeof PROVIDER_OPERATIONS];

/** All operation string values, e.g. for validation / iteration. */
export const PROVIDER_OPERATION_VALUES: readonly ProviderOperation[] =
  Object.values(PROVIDER_OPERATIONS);

/** What initiated a provider call. Written to `provider_usage_events.trigger_type`. */
export const TRIGGER_TYPES = {
  USER: "user",
  CRON: "cron",
  BACKGROUND: "background",
  ADMIN: "admin",
  SYSTEM: "system",
  RETRY: "retry",
} as const;

export type TriggerType = (typeof TRIGGER_TYPES)[keyof typeof TRIGGER_TYPES];

export const TRIGGER_TYPE_VALUES: readonly TriggerType[] =
  Object.values(TRIGGER_TYPES);

/** Known provider identifiers. Written to `provider_usage_events.provider`. */
export const PROVIDERS = {
  IMPORTYETI: "importyeti",
  APOLLO: "apollo",
} as const;

export type Provider = (typeof PROVIDERS)[keyof typeof PROVIDERS];

/** DB-controlled kill-switch flag keys, checked via the `lit_provider_flag(text)` RPC. */
export const PROVIDER_FLAGS = {
  IMPORTYETI_ENABLED: "IMPORTYETI_ENABLED",
  IMPORTYETI_BACKGROUND_REFRESH_ENABLED: "IMPORTYETI_BACKGROUND_REFRESH_ENABLED",
} as const;

export type ProviderFlag = (typeof PROVIDER_FLAGS)[keyof typeof PROVIDER_FLAGS];

function isMember<T extends string>(values: readonly T[], v: string): v is T {
  return (values as readonly string[]).includes(v);
}

/** Narrow an arbitrary string to a known operation, else `other`. */
export function normalizeOperation(op: string | null | undefined): ProviderOperation {
  return op && isMember(PROVIDER_OPERATION_VALUES, op)
    ? op
    : PROVIDER_OPERATIONS.OTHER;
}
