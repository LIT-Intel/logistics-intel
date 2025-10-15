export type FeatureFlags = {
  companyDrawerPremium: boolean;
};

import { useEffect, useState } from 'react';
import { getFeatureFlags } from '@/lib/crm';

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>({ companyDrawerPremium: true });
  useEffect(() => {
    let cancelled = false;
    getFeatureFlags().then((res) => {
      if (cancelled) return;
      const map: Record<string, boolean> = {};
      for (const row of res.flags || []) map[row.key] = !!row.enabled;
      setFlags({ companyDrawerPremium: map.companyDrawerPremium ?? true });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return flags;
}

