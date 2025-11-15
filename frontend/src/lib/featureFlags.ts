import { getGatewayBase } from '@/lib/env';

export const FLAGS = {
  IMPORTYETI_PRO_ENABLED: process.env.NEXT_PUBLIC_IMPORTYETI_PRO_ENABLED === 'true',
};

const PROXY_BASE = '/api/lit';

export type FeatureFlags = {
  pro?: boolean;
  enterprise?: boolean;
  enrich_enabled?: boolean;
  gating?: Record<string, boolean>;
  _source?: 'remote' | 'local-fallback';
};

/**
 * Returns feature flags. Never throws: on 404/500/network error,
 * returns a permissive-but-safe default so the UI can render.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  try {
    let base: string;
    try {
      base = getGatewayBase();
    } catch {
      base = PROXY_BASE;
    }

    const res = await fetch(`${base}/crm/feature-flags`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ...data, _source: 'remote' as const };
    }
  } catch {}
  try {
    const res = await fetch(`${PROXY_BASE}/crm/feature-flags`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ...data, _source: 'remote' as const };
    }
  } catch {}
  // Safe defaults: enable basic screens, let Search run, avoid blocking UI
  return {
    pro: true,
    enterprise: false,
    enrich_enabled: true,
    gating: {},
    _source: 'local-fallback'
  };
}
