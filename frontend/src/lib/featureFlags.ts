export type FeatureFlags = {
  gates: Record<string, boolean>;
  killSwitches: Record<string, boolean>;
  variants: Record<string, unknown>;
  _source?: string;
};

export async function fetchFeatureFlags(apiBase: string): Promise<FeatureFlags> {
  try {
    const base = apiBase?.replace(/\/$/, '') || '';
    const res = await fetch(`${base}/crm/feature-flags`, { credentials: 'omit' });
    if (!res.ok) throw new Error(`feature-flags ${res.status}`);
    return (await res.json()) as FeatureFlags;
  } catch {
    return {
      gates: { pro: false, enterprise: false },
      killSwitches: {},
      variants: {},
      _source: 'local-fallback',
    };
  }
}

