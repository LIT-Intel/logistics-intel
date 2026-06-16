// SupplyChainFilterContext — single source of truth for the active service-mode
// filter on the Company Profile → Supply Chain tab.
//
// The filter chip strip (ServiceModeFilterChips) writes to this context; chart
// cards (ServiceModeDonut, LaneMixStackedBar, etc) read from it to gray out
// non-matching slices or pre-select a slice when an external chip is clicked.
//
// Click semantics:
//   - chip on  → `activeMode` is that mode
//   - chip on (same again) → `activeMode` becomes null (toggle off = "All")
//   - explicit "All" pill → activeMode = null
//
// Selected HS code is a sibling axis used by the Products → Lanes drill: the
// HsCodeTopBar sets `selectedHs`, LaneMixStackedBar reads it to scope its data.

import React, { createContext, useContext, useMemo, useState } from "react";
import type { ServiceMode } from "@/components/icons/ServiceModeIcons";

export type SupplyChainFilterContextValue = {
  activeMode: ServiceMode | null;
  setActiveMode: (m: ServiceMode | null) => void;
  selectedHs: string | null;
  setSelectedHs: (hs: string | null) => void;
};

const Ctx = createContext<SupplyChainFilterContextValue | null>(null);

export function SupplyChainFilterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeMode, setActiveMode] = useState<ServiceMode | null>(null);
  const [selectedHs, setSelectedHs] = useState<string | null>(null);
  const value = useMemo(
    () => ({ activeMode, setActiveMode, selectedHs, setSelectedHs }),
    [activeMode, selectedHs],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * useSupplyChainFilter — returns the active mode + setters. Safe outside the
 * provider (returns no-op handlers + null state) so cards stay testable in
 * isolation and don't crash if mounted standalone.
 */
export function useSupplyChainFilter(): SupplyChainFilterContextValue {
  const v = useContext(Ctx);
  if (v) return v;
  // Standalone fallback — keeps cards usable in storybook / unit tests.
  return {
    activeMode: null,
    setActiveMode: () => {},
    selectedHs: null,
    setSelectedHs: () => {},
  };
}
