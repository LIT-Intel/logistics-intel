/**
 * Marketing broadcasts — admin API client.
 *
 * Talks to the marketing-site proxy at /api/admin/broadcasts. The proxy
 * holds RESEND_API_KEY server-side and verifies the caller is an admin
 * via the Supabase JWT before forwarding to Resend's /broadcasts endpoint.
 *
 * The 12 Resend Audience ids live in Vercel env on the marketing side. We
 * keep a static label/env-var registry here so the composer can render a
 * dropdown without round-tripping to Resend; the operator picks a label
 * and we POST the corresponding env-var name, which the server resolves
 * to the actual aud_xxx id.
 */
import { supabase } from "@/lib/supabase";

// The proxy lives on the marketing site (Next.js at logisticintel.com),
// NOT in this Vite SPA. Hitting "/api/admin/broadcasts" from app.logisticintel.com
// would return the SPA's index.html fallback and the JSON parse would
// silently fail with a "200" status — hence the absolute base.
const DEFAULT_MARKETING_BASE = "https://logisticintel.com";
const MARKETING_API_BASE =
  (import.meta as any)?.env?.VITE_MARKETING_API_BASE_URL?.toString().trim() ||
  DEFAULT_MARKETING_BASE;

const PROXY_BASE = `${MARKETING_API_BASE.replace(/\/$/, "")}/api/admin/broadcasts`;

export type BroadcastStatus =
  | "draft"
  | "queued"
  | "sending"
  | "sent"
  | "failed";

export type Broadcast = {
  id: string;
  resend_broadcast_id: string | null;
  name: string;
  audience_id: string;
  audience_name: string | null;
  from_email: string;
  reply_to_email: string | null;
  subject: string;
  preview_text: string | null;
  html?: string;
  status: BroadcastStatus | string;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateBroadcastPayload = {
  /** When present, update an existing draft instead of inserting. */
  id?: string;
  name: string;
  audience_id: string;
  audience_name?: string;
  from?: string;
  reply_to?: string;
  subject: string;
  preview_text?: string;
  html: string;
  /** ISO8601. Omit / pass null to send immediately. */
  scheduled_at?: string | null;
};

/**
 * The 12 Resend Audiences provisioned for LIT inbound — 4 funnel + 4
 * industry + 4 channel. Audience id resolution happens server-side via
 * Vercel env vars; the client only ever sends the audience-id string
 * (we forward the env-var NAME and the server proxy maps it to the
 * actual `aud_xxx` value before calling Resend).
 *
 * If a marketing op needs to broadcast to a custom audience id not in
 * this list, the composer's "audience id" field accepts free-text too.
 */
export type AudienceOption = {
  /** What we POST to the proxy. Either an env-var name or a raw aud_xxx. */
  value: string;
  label: string;
  group: "Funnel" | "Industry" | "Channel";
  /** Optional last-known size. Hard-coded TODO until we wire the Resend
   *  audiences endpoint server-side. */
  size?: number;
};

export const AUDIENCE_OPTIONS: AudienceOption[] = [
  { value: "RESEND_AUDIENCE_TRIAL_LEADS", label: "LIT — Trial Leads", group: "Funnel" },
  { value: "RESEND_AUDIENCE_TOP_100_PDF", label: "LIT — Top-100 PDF Leads", group: "Funnel" },
  { value: "RESEND_AUDIENCE_PARTNERS", label: "LIT — Partner Applicants", group: "Funnel" },
  { value: "RESEND_AUDIENCE_COMPARISON", label: "LIT — Comparison Researchers", group: "Funnel" },
  { value: "RESEND_AUDIENCE_FORWARDERS", label: "LIT — Freight Forwarders", group: "Industry" },
  { value: "RESEND_AUDIENCE_BROKERS", label: "LIT — Freight Brokers", group: "Industry" },
  { value: "RESEND_AUDIENCE_NVOCCS", label: "LIT — NVOCCs", group: "Industry" },
  { value: "RESEND_AUDIENCE_3PLS", label: "LIT — 3PLs", group: "Industry" },
  { value: "RESEND_AUDIENCE_PPC", label: "LIT — PPC Inbound", group: "Channel" },
  { value: "RESEND_AUDIENCE_SEO", label: "LIT — SEO Inbound", group: "Channel" },
  { value: "RESEND_AUDIENCE_SOCIAL", label: "LIT — Social Inbound", group: "Channel" },
  { value: "RESEND_AUDIENCE_DIRECT", label: "LIT — Direct / Referral", group: "Channel" },
];

/** Drip-template registry the operator can seed the composer from. */
export type TemplateOption = {
  /** Env-var name of the Resend template id. The server can resolve it; for
   *  v1 the operator pastes / edits the HTML directly so we just use this
   *  as a label hint. */
  envVar: string;
  label: string;
  sequence: string;
  step: number;
  subject: string;
};

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  // Trial welcome (5)
  { envVar: "RESEND_TPL_TRIAL_WELCOME", label: "Trial · Step 1 — Welcome", sequence: "Trial Welcome", step: 1, subject: "Your LIT trial is ready — 10 searches + 10 verified contacts" },
  { envVar: "RESEND_TPL_TRIAL_DAY_2", label: "Trial · Step 2 — Social proof", sequence: "Trial Welcome", step: 2, subject: "How forwarders book 4× more meetings with LIT" },
  { envVar: "RESEND_TPL_TRIAL_DAY_5", label: "Trial · Step 3 — Trial reminder", sequence: "Trial Welcome", step: 3, subject: "Your free searches expire in 9 days" },
  { envVar: "RESEND_TPL_TRIAL_DAY_9", label: "Trial · Step 4 — Demo nudge", sequence: "Trial Welcome", step: 4, subject: "Want a 30-min walkthrough on your lanes?" },
  { envVar: "RESEND_TPL_TRIAL_DAY_14", label: "Trial · Step 5 — Recap", sequence: "Trial Welcome", step: 5, subject: "Your LIT trial ended — here is what we built for you" },
  // Top 100 PDF (3)
  { envVar: "RESEND_TPL_TOP_100_DELIVERY", label: "Top-100 · Step 1 — Delivery", sequence: "Top-100 PDF", step: 1, subject: "Top 100 active shippers in your lane (this week's data)" },
  { envVar: "RESEND_TPL_TOP_100_DAY_3", label: "Top-100 · Step 2 — Use cases", sequence: "Top-100 PDF", step: 2, subject: "The 6 things every freight rep does with the top-100 list" },
  { envVar: "RESEND_TPL_TOP_100_DAY_7", label: "Top-100 · Step 3 — Convert", sequence: "Top-100 PDF", step: 3, subject: "What if you had this list refreshed every Monday?" },
  // Partner onboarding (3)
  { envVar: "RESEND_TPL_PARTNER_RECEIVED", label: "Partner · Step 1 — Received", sequence: "Partner Onboarding", step: 1, subject: "We got your LIT partner application — what happens next" },
  { envVar: "RESEND_TPL_PARTNER_APPROVED", label: "Partner · Step 2 — Approved", sequence: "Partner Onboarding", step: 2, subject: "Your LIT partner link is live — start earning 15%" },
  { envVar: "RESEND_TPL_PARTNER_DAY_7", label: "Partner · Step 3 — Coaching", sequence: "Partner Onboarding", step: 3, subject: "Partner tips: the 3 audiences that convert fastest" },
  // Comparison nurture (2)
  { envVar: "RESEND_TPL_COMPARISON_WELCOME", label: "Comparison · Step 1 — Welcome", sequence: "Comparison Nurture", step: 1, subject: "Side-by-side: LIT vs {{competitor}} — the version we never publish" },
  { envVar: "RESEND_TPL_COMPARISON_DAY_4", label: "Comparison · Step 2 — Churn", sequence: "Comparison Nurture", step: 2, subject: "Why teams leave {{competitor}} after 6 months" },
];

export const DEFAULT_FROM_EMAIL = "Logistic Intel <pulse@logisticintel.com>";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const h: Record<string, string> = { "content-type": "application/json" };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export async function listBroadcasts(limit = 100): Promise<Broadcast[]> {
  const headers = await authHeaders();
  const resp = await fetch(`${PROXY_BASE}?limit=${limit}`, { headers });
  const body = (await resp.json().catch(() => null)) as
    | { ok: true; broadcasts: Broadcast[] }
    | { ok: false; error: string }
    | null;
  if (!resp.ok || !body || !("ok" in body) || !body.ok) {
    throw new Error(
      (body && "error" in body && body.error) || `listBroadcasts ${resp.status}`,
    );
  }
  return body.broadcasts;
}

export async function getBroadcast(id: string): Promise<Broadcast> {
  const headers = await authHeaders();
  const resp = await fetch(`${PROXY_BASE}?id=${encodeURIComponent(id)}`, { headers });
  const body = (await resp.json().catch(() => null)) as
    | { ok: true; broadcast: Broadcast }
    | { ok: false; error: string }
    | null;
  if (!resp.ok || !body || !("ok" in body) || !body.ok) {
    throw new Error(
      (body && "error" in body && body.error) || `getBroadcast ${resp.status}`,
    );
  }
  return body.broadcast;
}

export async function createBroadcast(payload: CreateBroadcastPayload): Promise<{
  broadcast: Broadcast;
  resend: { id?: string; status?: string } | null;
}> {
  const headers = await authHeaders();
  const resp = await fetch(PROXY_BASE, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = (await resp.json().catch(() => null)) as
    | { ok: true; broadcast: Broadcast; resend: { id?: string; status?: string } | null }
    | { ok: false; error: string; broadcast?: Broadcast }
    | null;
  if (!resp.ok || !body || !("ok" in body) || !body.ok) {
    throw new Error(
      (body && "error" in body && body.error) || `createBroadcast ${resp.status}`,
    );
  }
  return { broadcast: body.broadcast, resend: body.resend };
}

export function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function statusTone(status: string): { bg: string; text: string; dot: string; label: string } {
  switch (status) {
    case "sent":
      return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Sent" };
    case "sending":
      return { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500", label: "Sending" };
    case "queued":
      return { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "Scheduled" };
    case "draft":
      return { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", label: "Draft" };
    case "failed":
      return { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500", label: "Failed" };
    default:
      return { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", label: status };
  }
}
