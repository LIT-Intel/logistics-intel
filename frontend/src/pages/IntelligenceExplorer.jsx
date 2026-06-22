// IntelligenceExplorer — the unified search workspace.
//
// Day-5 PRD pivot (2026-06-20): replaces the legacy Search page mount
// at /app/search with the two-tab ExplorerShell (Company Search + Pulse
// Explorer). Default tab is Company Search (company-name lookup is the
// most common entry point); ?tab=pulse opens the NL Pulse Explorer.
//
// Plan gating: the page itself is reachable on every paid tier + the
// free trial (mirrors the previous Search page). The Pulse tab has its
// own internal gate (via useEntitlements inside PulseExploreTab) that
// matches the prior /app/prospecting behaviour.
//
// Routing: see frontend/src/App.jsx — /app/search and
// /app/intelligence-explorer both mount this page. /app/prospecting
// redirects to /app/search?tab=pulse.

import ExplorerShell from '@/components/explorer/ExplorerShell';

export default function IntelligenceExplorer() {
  // Make the page take the full available height under AppLayout so
  // ExplorerShell's vertical sections (header → analytics → map →
  // results) lay out without overflow.
  //
  // Mobile note: AppHeader has a different height on small screens
  // (extra hamburger + thinner padding) so we don't hard-code a vh
  // calc. Instead we stretch via min-h-0 + flex-1 inside AppLayout's
  // <main>, and use dvh on supporting browsers to dodge the iOS
  // address-bar bounce that makes 100vh trim the bottom row.
  return (
    <div className="-mx-[10px] -my-4 flex h-[calc(100dvh-3.5rem)] min-h-[420px] flex-1 flex-col overflow-hidden">
      <ExplorerShell defaultMode="company" />
    </div>
  );
}
