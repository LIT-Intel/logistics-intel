// ExplorerShell — the unified Intelligence Explorer container.
//
// Day-5 PRD pivot (2026-06-20): merge the Search and Pulse Explorer
// pages into a single workspace with two tabs (Company Search + Pulse
// Explorer) that share a map, a Coach panel, a QuickCard, and a save
// flow. This file is the orchestrator that holds the two tabs and the
// shared context.
//
// Phasing:
//   PR 1 (this commit): SCAFFOLD ONLY. Shell exists with mode context
//   + ExplorerTabs component. Only the Pulse tab is wired (it renders
//   the existing PulseExploreTab unchanged). The Company Search tab is
//   defined in ExplorerTabs but flagged as `disabled` until PR 2 ships
//   its implementation. The Pulse Explorer page mounts the shell with
//   `hideTabs` so the user-visible UI is identical to today.
//
//   PR 2: drops CompanySearchTab implementation in here, flips
//   hideTabs off, and migrates /app/search from the legacy Search.tsx
//   to mount this shell with defaultMode="company". /app/prospecting
//   becomes a 308 redirect to /app/search?tab=pulse.
//
// What this shell will own once both tabs land:
//   • Shared header (Intelligence Explorer title, mode-aware search
//     placeholder, view-mode toggles).
//   • Shared map (ExplorerMap, currently ExploreMapMaplibre) — accepts
//     the same generic row shape from either tab.
//   • Shared analytics bar (mode-aware metrics).
//   • Shared filter chip row.
//   • Shared right-rail QuickCard with a "Refresh latest data" button
//     that dispatches getIyCompanyProfile({forceRefresh:true}) for
//     Company Search rows and the pulse-side refresh for Pulse rows.
//   • Shared InsightsPanel (Coach) that knows which mode is active.

import PulseExploreTab from '@/features/pulse/explore/PulseExploreTab';
import CompanySearchTab from './CompanySearchTab';
import { ExplorerProvider, useExplorer } from './ExplorerContext';

/**
 * Public entry point. Wrap whatever route mounts the shell in this.
 *
 * @param {object} props
 * @param {('company'|'pulse')} [props.defaultMode='pulse'] - Which tab is
 *   active on mount. PR 1 callers always pass "pulse"; PR 2 will start
 *   passing "company" for /app/search.
 * @param {boolean} [props.hideTabs=false] - Suppresses the top tab bar.
 *   PR 1 sets this to true so the Pulse Explorer page (still mounted
 *   from Pulse.jsx) looks identical to today. PR 2 leaves it false at
 *   /app/search.
 */
export default function ExplorerShell({ defaultMode = 'pulse', hideTabs = false }) {
  return (
    <ExplorerProvider defaultMode={defaultMode}>
      <ExplorerShellInner hideTabs={hideTabs} />
    </ExplorerProvider>
  );
}

function ExplorerShellInner({ hideTabs }) {
  const { mode } = useExplorer();
  // MERGED (2026-09-03): the tab bar is retired — /app/search is now a single
  // unified Google-Maps search+explore surface (CompanySearchTab). Pulse's
  // market-browse stays reachable via ?tab=pulse (/app/prospecting) for power
  // users, just without a competing tab. `hideTabs` is now a no-op kept for
  // call-site compatibility.
  void hideTabs;
  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex-1 min-h-0">
        {mode === 'pulse' ? <PulseExploreTab /> : <CompanySearchTab />}
      </div>
    </div>
  );
}
