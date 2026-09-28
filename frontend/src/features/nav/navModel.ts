/**
 * nav model — the single source of truth for the ⌘K command palette's
 * "Go to" targets, the sidebar hover-flyout tab lists, and the Alt+digit
 * Command-Center tab shortcuts. Keeping the tab lists here means the palette
 * and the flyout never drift apart.
 */

/** Command Center tabs (match CommandCenter.tsx CrmView + the tab row order). */
export type CcTabKey = "accounts" | "pipeline" | "tasks" | "reports";
export type CcTab = { key: CcTabKey; label: string; altDigit: number };

// altDigit → event.code "Digit{n}" for the Alt+1..4 shortcuts. Order matches
// the on-screen tab row (Saved companies, Pipeline, Tasks, Reports).
export const CC_TABS: CcTab[] = [
  { key: "accounts", label: "Saved companies", altDigit: 1 },
  { key: "pipeline", label: "Pipeline", altDigit: 2 },
  { key: "tasks", label: "Tasks", altDigit: 3 },
  { key: "reports", label: "Reports", altDigit: 4 },
];

/** Outbound Engine tabs (match OutboundEngineV2 ?tab= values). */
export type OutboundTab = { tab: string; label: string; altDigit: number };
export const OUTBOUND_TABS: OutboundTab[] = [
  { tab: "campaigns", label: "Campaigns", altDigit: 1 },
  { tab: "inbox", label: "Inbox", altDigit: 2 },
  { tab: "templates", label: "Templates", altDigit: 3 },
  { tab: "mailboxes", label: "Mailboxes", altDigit: 4 },
];

export const CC_PATH = "/app/command-center";
export const OUTBOUND_PATH = "/app/outbound";

/** Bridge event: the global Alt-digit / palette listener asks CommandCenter to
 *  switch its internal `view` state (it owns the tab, not the URL). */
export const CC_SET_TAB_EVENT = "lit:cc-set-tab";
export function dispatchCcTab(key: CcTabKey): void {
  try {
    window.dispatchEvent(new CustomEvent(CC_SET_TAB_EVENT, { detail: key }));
  } catch {
    /* SSR / no window */
  }
}

/** A palette "Go to" or "Action" entry. `to` is a react-router path; `ccTab`
 *  (when set) also fires the CC tab bridge so a Go-to lands on the right tab
 *  even when already on /app/command-center (no navigation would occur). */
export type PaletteTarget = {
  id: string;
  label: string;
  hint?: string;
  to: string;
  ccTab?: CcTabKey;
  outboundTab?: string;
};

export const GO_TO_TARGETS: PaletteTarget[] = [
  { id: "go-dashboard", label: "Dashboard", to: "/app/dashboard" },
  { id: "go-discover", label: "Discover · Intelligence Explorer", to: "/app/search" },
  // Command Center tabs
  ...CC_TABS.map((t) => ({
    id: `go-cc-${t.key}`,
    label: `Command Center · ${t.label}`,
    hint: `⌥${t.altDigit}`,
    to: CC_PATH,
    ccTab: t.key,
  })),
  // Outbound tabs
  ...OUTBOUND_TABS.map((t) => ({
    id: `go-ob-${t.tab}`,
    label: `Outbound · ${t.label}`,
    to: `${OUTBOUND_PATH}?tab=${t.tab}`,
    outboundTab: t.tab,
  })),
];

export const ACTION_TARGETS: PaletteTarget[] = [
  // "New deal" → Pipeline tab (deal creation lives on the pipeline board).
  { id: "act-new-deal", label: "New deal", hint: "Pipeline", to: CC_PATH, ccTab: "pipeline" },
  { id: "act-new-campaign", label: "New campaign", hint: "Outbound", to: `${OUTBOUND_PATH}?tab=templates`, outboundTab: "templates" },
  // "Add task" → Tasks tab (the Add-task modal lives there).
  { id: "act-add-task", label: "Add task", hint: "Tasks", to: CC_PATH, ccTab: "tasks" },
];
