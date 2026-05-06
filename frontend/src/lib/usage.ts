// Frontend bridge to the usage-enforcement system.
// Calls the get-entitlements edge function (single source of truth).
// Provides:
//   - useEntitlements() React hook
//   - parseLimitExceeded(response) helper for global error handling
//   - FEATURE_LABELS for UI copy

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/auth/supabaseAuthClient';

export type FeatureKey =
  | 'company_search'
  | 'company_profile_view'
  | 'saved_company'
  | 'saved_contact'
  | 'contact_enrichment'
  | 'pulse_brief'
  | 'pulse_ai'
  | 'pulse_search'
  | 'saved_pulse_list'
  | 'export_pdf'
  | 'campaign_send'
  | 'ai_brief'
  | 'team_invite';

export interface Entitlements {
  plan: string;
  plan_name: string;
  reset_at: string | null;
  trial_ends_at?: string | null;
  trial_days?: number;
  is_admin_bypass?: boolean;
  market_benchmark_enabled: boolean;
  features: Record<string, boolean>;
  limits: Record<FeatureKey, number | null>;
  used: Record<FeatureKey, number>;
  seats?: { included: number | null; used: number };
}

export interface LimitExceeded {
  ok: false;
  code: 'LIMIT_EXCEEDED';
  feature: FeatureKey;
  used: number;
  limit: number;
  plan: string;
  reset_at: string | null;
  upgrade_url: string;
  message: string;
}

export const FEATURE_LABELS: Record<FeatureKey, { singular: string; plural: string; verb: string }> = {
  company_search:       { singular: 'company search',     plural: 'company searches',  verb: 'search' },
  company_profile_view: { singular: 'company profile view', plural: 'profile views',   verb: 'view a profile' },
  saved_company:        { singular: 'saved company',      plural: 'saved companies',   verb: 'save a company' },
  saved_contact:        { singular: 'saved contact',      plural: 'saved contacts',    verb: 'save a contact' },
  contact_enrichment:   { singular: 'contact enrichment', plural: 'contact enrichments', verb: 'enrich a contact' },
  pulse_brief:          { singular: 'Pulse brief',        plural: 'Pulse briefs',      verb: 'run a Pulse brief' },
  pulse_ai:             { singular: 'Pulse AI run',       plural: 'Pulse AI runs',     verb: 'run Pulse AI' },
  pulse_search:         { singular: 'Pulse search',       plural: 'Pulse searches',    verb: 'run a Pulse search' },
  saved_pulse_list:     { singular: 'saved Pulse list',   plural: 'saved Pulse lists', verb: 'save a Pulse list' },
  export_pdf:           { singular: 'PDF export',         plural: 'PDF exports',       verb: 'export a PDF' },
  campaign_send:        { singular: 'campaign send',      plural: 'campaign sends',    verb: 'send a campaign' },
  ai_brief:             { singular: 'AI brief',           plural: 'AI briefs',         verb: 'generate an AI brief' },
  team_invite:          { singular: 'team seat',          plural: 'team seats',        verb: 'invite a team member' },
};

async function callGetEntitlements(): Promise<Entitlements | null> {
  if (!supabase) return null;
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return null;
  const url = `${
    (import.meta as ImportMeta & { env?: { VITE_SUPABASE_URL?: string } }).env
      ?.VITE_SUPABASE_URL ?? ''
  }/functions/v1/get-entitlements`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.ok || !data.entitlements) return null;
  return data.entitlements as Entitlements;
}

export interface UseEntitlementsResult {
  entitlements: Entitlements | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasFeature: (key: string) => boolean;
  remaining: (key: FeatureKey) => number | null; // null = unlimited
  reachedLimit: (key: FeatureKey) => boolean;
}

export function useEntitlements(): UseEntitlementsResult {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await callGetEntitlements();
      if (!result) {
        setError('Could not load entitlements');
        setEntitlements(null);
      } else {
        setEntitlements(result);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await callGetEntitlements();
      if (cancelled) return;
      if (result) setEntitlements(result);
      else setError('Could not load entitlements');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const hasFeature = useCallback(
    (key: string) => Boolean(entitlements?.features?.[key]),
    [entitlements],
  );
  const remaining = useCallback(
    (key: FeatureKey) => {
      if (!entitlements) return null;
      const limit = entitlements.limits[key];
      const used = entitlements.used[key] ?? 0;
      if (limit === null) return null; // unlimited
      return Math.max(0, limit - used);
    },
    [entitlements],
  );
  const reachedLimit = useCallback(
    (key: FeatureKey) => {
      if (!entitlements) return false;
      const limit = entitlements.limits[key];
      const used = entitlements.used[key] ?? 0;
      if (limit === null) return false;
      return used >= limit;
    },
    [entitlements],
  );

  return { entitlements, loading, error, refresh, hasFeature, remaining, reachedLimit };
}

// Parse a fetch response/body for a LIMIT_EXCEEDED contract.
// Returns the LimitExceeded object if matched, otherwise null.
export function parseLimitExceeded(body: unknown): LimitExceeded | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.ok === false && b.code === 'LIMIT_EXCEEDED' && typeof b.feature === 'string') {
    return b as unknown as LimitExceeded;
  }
  return null;
}

// Given a fetch Response that returned 403, try to parse it as a
// LIMIT_EXCEEDED. Returns null if not a quota error.
export async function parseLimitFromResponse(res: Response): Promise<LimitExceeded | null> {
  if (res.status !== 403) return null;
  try {
    const cloned = res.clone();
    const body = await cloned.json();
    return parseLimitExceeded(body);
  } catch {
    return null;
  }
}
