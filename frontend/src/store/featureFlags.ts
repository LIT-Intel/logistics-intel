export type FeatureFlags = {
  companyDrawerPremium: boolean;
};

const defaultFlags: FeatureFlags = {
  companyDrawerPremium: true, // TODO: read from backend flag in future
};

export function useFeatureFlags(): FeatureFlags {
  // simple static hook for now; could be Zustand/Context later
  return defaultFlags;
}

