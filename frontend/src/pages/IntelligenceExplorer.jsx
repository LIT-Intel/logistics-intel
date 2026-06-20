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
  return (
    <div className="-mx-[10px] -my-4 h-[calc(100vh-72px)] overflow-hidden">
      <ExplorerShell defaultMode="company" />
    </div>
  );
}
