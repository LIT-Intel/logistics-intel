/**
 * Outbound Engine v2 — pure selectors. Ports the `crm()` outbound branches of
 * the design prototype (Command Center.dc.html) onto REAL data shapes.
 *
 * Type-only imports keep this module free of the Supabase client so vitest
 * can import it without env setup.
 */
import type {
  CampaignAggregates,
  EmailThreadRow,
  MailAccountRow,
  MailboxStats,
  OutboundStepRow,
  StepVariant,
} from "../api";
import type { OutboundCampaign } from "@/features/outbound/types";

// ────────────────────────────────────────────────────────── formatting

export const fmtNum = (n: number): string =>
  Number.isFinite(n) ? n.toLocaleString("en-US") : "—";

export const fmtMoney = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

export const relTime = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.round(diff / min))}m`;
  if (diff < day) return `${Math.round(diff / hour)}h`;
  if (diff < 30 * day) return `${Math.round(diff / day)}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/**
 * Percentage of `n` over `base`, clamped to [0, 100]. Spec/QA rule: funnel
 * percentages use the stated bases and NEVER exceed 100.
 */
export function pctOf(n: number, base: number | null | undefined): number | null {
  if (base == null || !Number.isFinite(base) || base <= 0) return null;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, (n / base) * 100);
}

export const pctLabel = (n: number, base: number | null | undefined): string => {
  const p = pctOf(n, base);
  return p == null ? "" : `${Math.round(p)}%`;
};

// ────────────────────────────────────────────────────────── channels

export type UiChannel = "email" | "linkedin" | "call";

/** Normalize any stored channel/step_type value onto the 3 UI channels. */
export function uiChannelOf(raw: string | null | undefined): UiChannel {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("call") || s.includes("phone")) return "call";
  return "email";
}

export const CHANNEL_META: Record<
  UiChannel,
  { label: string; fg: string; bg: string; openLabel: string }
> = {
  email: { label: "Email", fg: "#1d4ed8", bg: "rgba(59,130,246,0.12)", openLabel: "Open" },
  linkedin: { label: "LinkedIn", fg: "#0369a1", bg: "rgba(14,165,233,0.12)", openLabel: "Accepted" },
  call: { label: "Call task", fg: "#0e7490", bg: "rgba(0,240,255,0.12)", openLabel: "Connected" },
};

export const STATUS_META: Record<string, { label: string; fg: string; bg: string }> = {
  active: { label: "Active", fg: "#047857", bg: "rgba(16,185,129,0.14)" },
  paused: { label: "Paused", fg: "#b45309", bg: "rgba(245,158,11,0.14)" },
  draft: { label: "Draft", fg: "#475569", bg: "#F1F5F9" },
  archived: { label: "Archived", fg: "#64748b", bg: "#F1F5F9" },
};

// ────────────────────────────────────────────────────────── campaign list

export interface FunnelCellVM {
  label: string;
  value: string;
  pct: string; // "" when no base
  width: number; // 0-100 for the 4px bar
  color: string;
}

/**
 * 5-column funnel for a campaign list row. Bases per spec:
 * Enrolled (no base) · Sent (no base) · Opened of sends · Replied of sends ·
 * Meetings of replies. Percentages clamp at 100.
 */
export function listFunnelCells(c: OutboundCampaign): FunnelCellVM[] {
  const f = c.funnel;
  const enrolled = f?.enrolled ?? 0;
  const sent = f?.sent ?? 0;
  const opened = f?.opened ?? 0;
  const replied = f?.replied ?? 0;
  const meetings = f?.meetings ?? 0;
  const cell = (
    label: string,
    n: number,
    base: number | null,
    color: string,
  ): FunnelCellVM => ({
    label,
    value: fmtNum(n),
    pct: base == null ? "" : pctLabel(n, base),
    width: base == null ? (n > 0 ? 100 : 0) : (pctOf(n, base) ?? 0),
    color,
  });
  return [
    cell("Enrolled", enrolled, null, "#94a3b8"),
    cell("Sent", sent, null, "#60a5fa"),
    cell("Opened", opened, sent > 0 ? sent : null, "#3b82f6"),
    cell("Replied", replied, sent > 0 ? sent : null, "#10b981"),
    cell("Meetings", meetings, replied > 0 ? replied : null, "#7c3aed"),
  ];
}

export interface CampaignsKpis {
  activeCount: number;
  enrolled: number;
  sent: number;
  opened: number;
  replied: number;
  meetings: number;
  openRate: string;
  replyRate: string;
}

export function campaignsKpis(campaigns: OutboundCampaign[]): CampaignsKpis {
  const act = campaigns.filter((c) => c.status === "active");
  const pool = act.length > 0 ? act : campaigns;
  const sum = (k: "enrolled" | "sent" | "opened" | "replied" | "meetings") =>
    pool.reduce((s, c) => s + (c.funnel?.[k] ?? 0), 0);
  const sent = sum("sent");
  return {
    activeCount: act.length,
    enrolled: sum("enrolled"),
    sent,
    opened: sum("opened"),
    replied: sum("replied"),
    meetings: sum("meetings"),
    openRate: sent > 0 ? pctLabel(sum("opened"), sent) : "—",
    replyRate: sent > 0 ? pctLabel(sum("replied"), sent) : "—",
  };
}

// ────────────────────────────────────────────────────────── detail funnel

export interface DetailFunnelRow {
  label: string;
  value: string; // "—" when the stage isn't tracked
  pct: string;
  width: number;
  color: string;
  missing: boolean;
}

/**
 * Campaign-detail funnel. Only stages with real events render numbers;
 * "Matched audience" has no backing query yet, so it renders "—" with a note
 * (never a fabricated count). Bases per spec: Enrolled of matched (—),
 * Opened of sends, Replied of enrolled, Meetings of replies.
 */
export function detailFunnel(agg: CampaignAggregates): {
  rows: DetailFunnelRow[];
  note: string | null;
} {
  const e = agg.events;
  const enrolled = agg.enrolledTotal;
  const row = (
    label: string,
    n: number | null,
    base: number | null,
    sfx: string,
    color: string,
  ): DetailFunnelRow => {
    if (n == null) {
      return { label, value: "—", pct: "", width: 0, color, missing: true };
    }
    const p = base != null && base > 0 ? pctOf(n, base) : null;
    return {
      label,
      value: fmtNum(n),
      pct: p == null ? "" : `${Math.round(p)}%${sfx}`,
      width: p == null ? (n > 0 ? 100 : 0) : Math.max(n > 0 ? 1.5 : 0, p),
      color,
      missing: false,
    };
  };
  return {
    rows: [
      row("Matched audience", null, null, "", "#cbd5e1"),
      row("Enrolled", enrolled, null, "", "#94a3b8"),
      row("Sent", e.sent, null, "", "#60a5fa"),
      row("Opened", e.opened, e.sent, " of sends", "#3b82f6"),
      row("Replied", e.replied, enrolled, " of enrolled", "#10b981"),
      row("Meetings", e.meetings, e.replied, " of replies", "#7c3aed"),
    ],
    note: "Matched audience isn't tracked yet — audience filters land with live shipment-data matching.",
  };
}

// ────────────────────────────────────────────────────────── step VMs

/**
 * Variants view of a step. Reads the `variants` jsonb when present;
 * otherwise migrates the legacy subject/subject_b pair into an A/B view.
 */
export function variantsOf(step: {
  subject: string | null;
  subject_b: string | null;
  body: string | null;
  variants: StepVariant[] | null;
}): StepVariant[] {
  if (Array.isArray(step.variants) && step.variants.length > 0) {
    return step.variants.map((v, i) => ({
      key: v.key || "ABCD"[i] || String(i + 1),
      subject: v.subject ?? "",
      body: v.body,
      sent: v.sent,
      opened: v.opened,
      replied: v.replied,
    }));
  }
  const out: StepVariant[] = [
    { key: "A", subject: step.subject ?? "", body: step.body ?? undefined },
  ];
  if (step.subject_b) out.push({ key: "B", subject: step.subject_b });
  return out;
}

/**
 * A/B winner = the variant with the higher reply rate, but ONLY when every
 * variant has ≥ minSends sends. Otherwise null (no Winner pill) — small
 * samples must not crown a winner.
 */
export function variantWinnerKey(
  variants: StepVariant[],
  minSends = 20,
): string | null {
  if (variants.length < 2) return null;
  if (!variants.every((v) => (v.sent ?? 0) >= minSends)) return null;
  const rate = (v: StepVariant) => (v.replied ?? 0) / Math.max(1, v.sent ?? 0);
  let best = variants[0];
  for (const v of variants.slice(1)) if (rate(v) > rate(best)) best = v;
  // Tie → no winner.
  if (variants.filter((v) => rate(v) === rate(best)).length > 1) return null;
  return best.key;
}

/** Wait connector label from delay_days/hours/minutes. */
export function waitLabelOf(step: {
  delay_days: number;
  delay_hours: number;
  delay_minutes: number;
}): string {
  const d = step.delay_days || 0;
  const h = step.delay_hours || 0;
  const m = step.delay_minutes || 0;
  if (d === 0 && h === 0 && m === 0) return "Sends on enrollment";
  const parts: string[] = [];
  if (d > 0 && h === 0 && m === 0) return `Wait ${d} day${d > 1 ? "s" : ""}`;
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return `Wait ${parts.join(" ")}`;
}

export interface StepVM {
  id: string;
  channel: UiChannel;
  channelLabel: string;
  fg: string;
  bg: string;
  openLabel: string;
  day: string; // "Day {n}" cumulative from delays
  title: string;
  hasWait: boolean;
  waitLabel: string;
  sent: number;
  opened: number;
  replied: number;
  openPct: string;
  replyPct: string;
  variants: Array<{
    key: string;
    subject: string;
    openPct: string;
    replyPct: string;
    winner: boolean;
  }>;
  raw: OutboundStepRow;
}

export function stepVMs(
  steps: OutboundStepRow[],
  perStep: CampaignAggregates["perStep"],
): StepVM[] {
  let day = 0;
  return steps.map((s, i) => {
    day += s.delay_days || 0;
    const ch = uiChannelOf(s.channel || s.step_type);
    const meta = CHANNEL_META[ch];
    const st = perStep?.get(s.id) ?? { sent: 0, opened: 0, replied: 0 };
    const vars = variantsOf(s);
    const winKey = variantWinnerKey(vars);
    return {
      id: s.id,
      channel: ch,
      channelLabel: meta.label,
      fg: meta.fg,
      bg: meta.bg,
      openLabel: meta.openLabel,
      day: `Day ${day}`,
      title:
        s.subject ||
        (s.metadata?.title as string) ||
        `${meta.label} step ${i + 1}`,
      hasWait: i > 0 && (s.delay_days || s.delay_hours || s.delay_minutes) > 0,
      waitLabel: waitLabelOf(s),
      sent: st.sent,
      opened: st.opened,
      replied: st.replied,
      openPct: st.sent > 0 ? pctLabel(st.opened, st.sent) : "—",
      replyPct: st.sent > 0 ? pctLabel(st.replied, st.sent) : "—",
      variants:
        vars.length > 1
          ? vars.map((v) => ({
              key: v.key,
              subject: v.subject,
              openPct:
                (v.sent ?? 0) > 0 ? pctLabel(v.opened ?? 0, v.sent ?? 0) : "—",
              replyPct:
                (v.sent ?? 0) > 0 ? pctLabel(v.replied ?? 0, v.sent ?? 0) : "—",
              winner: winKey === v.key,
            }))
          : [],
      raw: s,
    };
  });
}

// ────────────────────────────────────────────────────────── intent

export type IntentId =
  | "meeting_request"
  | "interested"
  | "not_now"
  | "out_of_office"
  | "unsubscribe"
  | "referral";

export const INTENT_META: Record<
  IntentId | "unclassified",
  { label: string; fg: string; bg: string }
> = {
  interested: { label: "Interested", fg: "#047857", bg: "rgba(16,185,129,0.14)" },
  meeting_request: { label: "Meeting request", fg: "#6d28d9", bg: "rgba(139,92,246,0.14)" },
  referral: { label: "Referral", fg: "#1d4ed8", bg: "rgba(59,130,246,0.12)" },
  not_now: { label: "Not now", fg: "#b45309", bg: "rgba(245,158,11,0.14)" },
  out_of_office: { label: "Out of office", fg: "#475569", bg: "#F1F5F9" },
  unsubscribe: { label: "Unsubscribe", fg: "#be123c", bg: "rgba(244,63,94,0.12)" },
  unclassified: { label: "Unclassified", fg: "#64748b", bg: "#F1F5F9" },
};

export const INTENT_ORDER: IntentId[] = [
  "interested",
  "meeting_request",
  "referral",
  "not_now",
  "out_of_office",
  "unsubscribe",
];

const RX = {
  unsubscribe: /\bunsubscribe\b|remove me (from|off)|\bopt.?out\b|stop (emailing|contacting)/i,
  ooo: /out of (the )?office|\booo\b|on (vacation|leave|holiday)|auto.?reply|automatic reply|i'?m out until|limited access to email|maternity|paternity/i,
  referral: /not the right (person|contact)|right person (for this|to talk)|copying (them|him|her)|cc'?ing|forward(ed|ing) (this|your)|reach out to (our|my)|better (person|contact) (is|would be)|runs (our|the) (procurement|logistics|ocean)/i,
  meeting: /\bmeeting\b|\bmeet\b|calendar|schedule (a |some )?(call|time|meeting)|send (an )?invite|does .{1,30}\bwork\b|availability|are you (free|available)|book (a|some) (time|meeting|call)|let'?s talk|send (a few |some )?times/i,
  notNow: /not (right )?now|not at this time|circle back|try (us|me|again) (again )?in|just renewed|budget is locked|maybe (later|next)|next (quarter|year)|revisit in|check back/i,
  interested: /\binterested\b|send (over |us |me )?(current |your )?(rates?|pricing|a quote)|what (rates?|pricing|transit)|can you (handle|quote|send)|tell me more|sounds (good|great)|worth a look|please share|transit times?/i,
};

/**
 * Keyword intent classifier for inbound replies. Returns null when nothing
 * matches — callers render a neutral "Unclassified" pill. NEVER defaults to
 * "Interested".
 */
export function classifyIntent(
  subject: string | null | undefined,
  body: string | null | undefined,
): IntentId | null {
  const text = `${subject ?? ""}\n${body ?? ""}`.trim();
  if (!text) return null;
  if (RX.unsubscribe.test(text)) return "unsubscribe";
  if (RX.ooo.test(text)) return "out_of_office";
  if (RX.referral.test(text)) return "referral";
  if (RX.meeting.test(text)) return "meeting_request";
  if (RX.notNow.test(text)) return "not_now";
  if (RX.interested.test(text)) return "interested";
  return null;
}

/** Normalize a stored lit_email_threads.intent value onto IntentId | null. */
export function normalizeIntent(raw: string | null | undefined): IntentId | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().replace(/[\s-]+/g, "_");
  return (INTENT_ORDER as string[]).includes(s) ? (s as IntentId) : null;
}

export interface ThreadVM {
  id: string;
  name: string;
  initials: string;
  subject: string;
  snippet: string;
  when: string;
  unread: boolean;
  intent: IntentId | null;
  intentMeta: { label: string; fg: string; bg: string };
  campaignId: string | null;
  raw: EmailThreadRow;
}

const initialsOf = (s: string): string => {
  const t = (s ?? "").trim();
  if (!t) return "?";
  if (t.includes(" "))
    return t
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return t.slice(0, 2).toUpperCase();
};

export function threadVMs(threads: EmailThreadRow[]): ThreadVM[] {
  return threads.map((t) => {
    const who =
      (t.participants ?? []).find((p) => p && (p.name || p.email)) ?? {};
    const name = who.name || who.email || "Unknown";
    const intent = normalizeIntent(t.intent) ?? classifyIntent(t.subject, null);
    return {
      id: t.id,
      name,
      initials: initialsOf(name),
      subject: t.subject || "(no subject)",
      snippet: t.subject || "",
      when: relTime(t.last_message_at),
      unread: (t.unread_count ?? 0) > 0,
      intent,
      intentMeta: INTENT_META[intent ?? "unclassified"],
      campaignId: t.campaign_id,
      raw: t,
    };
  });
}

export function intentCounts(
  vms: ThreadVM[],
): Record<IntentId | "all" | "unclassified", number> {
  const out: Record<string, number> = { all: vms.length, unclassified: 0 };
  for (const k of INTENT_ORDER) out[k] = 0;
  for (const v of vms) {
    if (v.intent) out[v.intent] += 1;
    else out.unclassified += 1;
  }
  return out as Record<IntentId | "all" | "unclassified", number>;
}

// ────────────────────────────────────────────────────────── mailboxes

export interface MailboxVM {
  id: string;
  address: string;
  provider: string;
  status: string;
  statusFg: string;
  statusBg: string;
  isPrimary: boolean;
  connected: boolean;
  needsAttention: boolean;
  /** null when per-account history isn't derivable */
  sent7: number | null;
  sent30: number | null;
  replies7: number | null;
  failed7: number | null;
}

const providerLabel = (p: string | null): string => {
  const s = String(p ?? "").toLowerCase();
  if (s.includes("gmail") || s.includes("google")) return "Google Workspace";
  if (s.includes("outlook") || s.includes("microsoft") || s.includes("365"))
    return "Microsoft 365";
  return p || "Email";
};

/**
 * Real mailbox cards: provider + connection status + real 7d/30d counts.
 * NO invented health score, DNS checks or warm-up — those need backing data
 * that doesn't exist yet (reported as omitted).
 */
export function mailboxVMs(
  accounts: MailAccountRow[],
  stats: MailboxStats | null,
): MailboxVM[] {
  return accounts.map((a) => {
    const st = String(a.status ?? "").toLowerCase();
    const connected = st === "connected" || st === "active";
    const needsAttention = !connected;
    const per = stats?.perAccount?.get(a.id) ?? null;
    return {
      id: a.id,
      address: a.email,
      provider: providerLabel(a.provider),
      status: connected ? "Connected" : a.status || "Unknown",
      statusFg: connected ? "#047857" : "#be123c",
      statusBg: connected ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
      isPrimary: Boolean(a.is_primary),
      connected,
      needsAttention,
      sent7: per ? per.sent7 : null,
      sent30: per ? per.sent30 : null,
      replies7: per ? per.replies7 : null,
      failed7: per ? per.failed7 : null,
    };
  });
}

/** Real mailbox-attention signal for the Campaigns-tab strip. */
export function mailboxAttention(vms: MailboxVM[]): {
  show: boolean;
  title: string;
  detail: string;
} {
  const bad = vms.filter((m) => m.needsAttention);
  if (bad.length === 0) return { show: false, title: "", detail: "" };
  return {
    show: true,
    title: `${bad.length} mailbox${bad.length > 1 ? "es need" : " needs"} attention.`,
    detail: bad
      .map((m) => `${m.address.split("@")[0]}@ status: ${m.status.toLowerCase()}`)
      .join(" · "),
  };
}

// ────────────────────────────────────────────────────────── token rendering

export interface TokenVars {
  first_name?: string | null;
  company?: string | null;
  top_lane?: string | null;
  carrier?: string | null;
  shipments_12m?: string | null;
  cadence?: string | null;
  sender_name?: string | null;
}

export const TOKENS = [
  "first_name",
  "company",
  "top_lane",
  "carrier",
  "shipments_12m",
  "cadence",
  "sender_name",
] as const;

/**
 * Render {{token}} placeholders with a REAL contact's values; unknown/missing
 * tokens stay raw (never invented sample values).
 */
export function renderTokens(text: string, vars: TokenVars): string {
  return (text || "").replace(/\{\{(\w+)\}\}/g, (m, k: string) => {
    const v = (vars as Record<string, string | null | undefined>)[k];
    return v != null && v !== "" ? String(v) : m;
  });
}

// ────────────────────────────────────────────────────────── curated plays
// Content from the design handoff (crm-data.js → PLAYS). Allowed as CONTENT
// (name/desc/audience/step outline). Their historical reply/meeting stats
// are placeholders and are intentionally OMITTED.

export interface PlayDef {
  name: string;
  cat: "Cold outreach" | "Signal-based" | "Re-engagement" | "Events";
  icon: string; // lucide name hint
  who: string;
  desc: string;
  channels: UiChannel[];
  aud: string[];
}

export const PLAY_CATS = [
  "Cold outreach",
  "Signal-based",
  "Re-engagement",
  "Events",
] as const;

export const PLAYS: PlayDef[] = [
  { name: "Lane launch", cat: "Cold outreach", icon: "route", who: "VP Logistics · Importer", desc: "Shippers moving on a new origin–destination lane, sorted by TEU and recency.", channels: ["email", "linkedin", "call"], aud: ["New lane in last 90 days", "TEU 12M ≥ 250", "Director and above"] },
  { name: "Competitor conquest", cat: "Cold outreach", icon: "crosshair", who: "Director of Procurement", desc: "Shippers booked with a named carrier. Opens with what you know about their routing.", channels: ["email", "linkedin"], aud: ["Current carrier · pick one", "Shipments 12M ≥ 100"] },
  { name: "New importer · first shipment", cat: "Cold outreach", icon: "package-plus", who: "Founder · Ops lead", desc: "Companies with their first U.S. import in the last 60 days. Reach them before they pick a forwarder.", channels: ["email", "call"], aud: ["First U.S. import in last 60 days"] },
  { name: "Signal-triggered", cat: "Signal-based", icon: "zap", who: "Auto-enroll on cadence shift", desc: "Auto-enrolls shippers whose cadence changed 30% or more in 60 days.", channels: ["email", "linkedin"], aud: ["Cadence change ≥ 30% in 60 days", "Saved or discovered"] },
  { name: "Carrier switch alert", cat: "Signal-based", icon: "shuffle", who: "Head of Logistics", desc: "Fires when a shipper moves volume to a new carrier. Leads with reliability and backup space.", channels: ["email", "linkedin", "call"], aud: ["Carrier changed in last 30 days", "Shipments 12M ≥ 50"] },
  { name: "Win-back · gone quiet", cat: "Re-engagement", icon: "rotate-ccw", who: "Existing relationship", desc: "Customers who stopped shipping with you. Triggers when they ship with someone else.", channels: ["email", "call"], aud: ["Saved companies", "No shipment in 90+ days"] },
  { name: "RFP follow-up", cat: "Re-engagement", icon: "file-check", who: "After quote sent", desc: "Multi-touch follow-up after a quote. Each step adds a lane insight.", channels: ["email", "linkedin", "call"], aud: ["Quote sent in last 30 days"] },
  { name: "TPM / event play", cat: "Events", icon: "calendar-days", who: "Pre and post conference", desc: "Two weeks before and two weeks after. Built to book meetings at the show.", channels: ["email", "linkedin"], aud: ["Attending the event", "TEU 12M ≥ 1,000"] },
];

/** Starter step copy (handoff BODY map) used when a play becomes a draft. */
const PLAY_BODY = {
  email:
    "Hi {{first_name}},\n\n{{company}} moved {{shipments_12m}} shipments on {{top_lane}} over the last 12 months, mostly with {{carrier}}. We have weekly space on that lane through peak season.\n\nWorth a 15-minute look at rates?\n\n{{sender_name}}",
  emailFollowUp:
    "Hi {{first_name}}, quick one.\n\nYou ship {{top_lane}} about every {{cadence}} days. If {{carrier}} rolls a booking in Q4, we can hold backup space for {{company}}.\n\nOpen to a side-by-side rate?\n\n{{sender_name}}",
  linkedin:
    "Hi {{first_name}}, I work with importers on {{top_lane}} and saw {{company}} has been shipping steadily. Would be good to connect.",
  call:
    "Opener: I noticed {{company}} ships {{top_lane}} about every {{cadence}} days with {{carrier}}.\nAsk: How are space and rollovers looking heading into peak?\nClose: Can I send a side-by-side rate for your next booking?",
};

export interface PlayStepOutline {
  channel: UiChannel;
  dbChannel: string; // value written to lit_campaign_steps.channel
  delayDays: number;
  title: string;
  subject: string | null;
  body: string;
}

/**
 * The starter sequence for a play, filtered to its channels (ported from the
 * prototype's stepsOf template shape: email d0 → linkedin d2 → email d4 →
 * call d7 → email d10, with per-step wait = delta days).
 */
export function playStepOutline(play: PlayDef): PlayStepOutline[] {
  const T: Array<{ ch: UiChannel; day: number; title: string; subject: string | null; body: string }> = [
    { ch: "email", day: 0, title: "Intro · capacity on their top lane", subject: "Capacity on your {{top_lane}} lane", body: PLAY_BODY.email },
    { ch: "linkedin", day: 2, title: "Connection request with note", subject: null, body: PLAY_BODY.linkedin },
    { ch: "email", day: 4, title: "Follow-up · peak surcharge outlook", subject: "Re: Q4 space on {{top_lane}}", body: PLAY_BODY.emailFollowUp },
    { ch: "call", day: 7, title: "Call · decision maker", subject: null, body: PLAY_BODY.call },
    { ch: "email", day: 10, title: "Close the loop · rate sheet attached", subject: "Rate sheet: {{top_lane}}, Q4", body: PLAY_BODY.email },
  ];
  const picked = T.filter((s) => play.channels.includes(s.ch));
  let prev = 0;
  return picked.map((s) => {
    const delayDays = s.day - prev;
    prev = s.day;
    return {
      channel: s.ch,
      dbChannel:
        s.ch === "linkedin" ? "linkedin_invite" : s.ch === "call" ? "call" : "email",
      delayDays,
      title: s.title,
      subject: s.subject,
      body: s.body,
    };
  });
}
