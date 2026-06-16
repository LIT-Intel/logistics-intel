// supabase/functions/_shared/region_presets.ts
// Region → US state code mapping. Single source of truth shared FE/BE.

const REGION_TO_STATES: Record<string, string[]> = {
  southeast: ["FL", "GA", "NC", "SC", "TN", "AL", "MS"],
  west_coast: ["CA", "OR", "WA"],
  northeast: ["NY", "NJ", "MA", "CT", "RI", "PA", "VT", "NH", "ME"],
  midwest: ["IL", "IN", "MI", "OH", "WI", "MN", "IA", "MO", "KS", "NE", "ND", "SD"],
  southwest: ["TX", "OK", "NM", "AZ"],
  mountain: ["CO", "UT", "WY", "MT", "ID", "NV"],
};

export const REGION_KEYS = Object.keys(REGION_TO_STATES);

export function expandRegion(key: string | null | undefined): string[] {
  if (!key) return [];
  return REGION_TO_STATES[key.toLowerCase()] ?? [];
}

export function regionToStatesMap(): Record<string, string[]> {
  return { ...REGION_TO_STATES };
}
