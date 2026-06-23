// ExplorerContext — shared state for the unified Intelligence Explorer
// shell. Carries the currently active tab + selected company so both
// Company Search and Pulse Explorer modes can share the same QuickCard
// detail rail, same map, same analytics bar, same Coach panel.
//
// Designed to grow incrementally:
//
//   PR 1 (this commit): tab + selectedCompany. Only the Pulse tab is
//   wired today.
//
//   PR 2 (next): adds CompanySearchTab implementation, the
//   `unsupported_filters` pillbar pass-through, and the cross-tab
//   refresh action that calls getIyCompanyProfile({ forceRefresh: true })
//   for Company Search rows AND the existing pulse-side refresh for
//   Pulse rows.
//
// Why a context instead of prop-drilling: ExplorerShell renders the
// header, tabs, and tab content as siblings — passing selection state
// through every layer would force most components to know about both
// modes. The context lets each tab read what it needs without coupling.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

export type ExplorerMode = 'company' | 'pulse';

/**
 * Mode-neutral company shape the QuickCard accepts from either tab.
 * Company Search rows fill `source: "importyeti"`; Pulse Explorer rows
 * fill `source: "pulse"`. The QuickCard refresh button switches its
 * backend call based on this field.
 */
export type SelectedCompany = {
  id: string;
  sourceCompanyKey?: string | null;
  companyId?: string | null;
  name: string;
  source: 'importyeti' | 'pulse' | 'crm';
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  // Pulse rows pass the whole parsed row; Company Search rows pass the
  // IyShipperHit. Tab content decides what to do with it.
  raw?: Record<string, unknown>;
};

type ExplorerCtx = {
  /** Active tab — "company" for ImportYeti-backed name lookup, "pulse" for the NL parser. */
  mode: ExplorerMode;
  /** Switches the active tab. PR 2 will persist this to ?tab= URL state. */
  setMode: (m: ExplorerMode) => void;
  /** The company currently expanded in the right-side QuickCard. Null when none open. */
  selectedCompany: SelectedCompany | null;
  /** Opens / closes the QuickCard. */
  setSelectedCompany: (c: SelectedCompany | null) => void;
};

const Ctx = createContext<ExplorerCtx | null>(null);

export function ExplorerProvider({
  defaultMode,
  children,
}: {
  defaultMode: ExplorerMode;
  children: ReactNode;
}) {
  // The active tab is driven by the ?tab= URL param so in-app navigation can
  // switch tabs WITHOUT a full reload. Previously mode was local state seeded
  // once from defaultMode, so e.g. the Explorer QuickCard's "Search for live
  // data" (navigate to ?tab=company&q=…) never switched tabs — the user had to
  // hard-reload. ?tab= also makes the tab choice survive refresh + be linkable.
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get('tab');
  const mode: ExplorerMode = tabParam === 'company' || tabParam === 'pulse' ? tabParam : defaultMode;
  const setMode = useCallback((m: ExplorerMode) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', m);
      return next;
    }, { replace: true });
  }, [setSp]);
  const [selectedCompany, setSelectedCompany] = useState<SelectedCompany | null>(null);

  const value = useMemo<ExplorerCtx>(
    () => ({ mode, setMode, selectedCompany, setSelectedCompany }),
    [mode, setMode, selectedCompany],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExplorer(): ExplorerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useExplorer must be used inside <ExplorerProvider>');
  return v;
}
