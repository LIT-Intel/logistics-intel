/**
 * Resend Audience routing for inbound leads.
 *
 * Every lead-capture submit is fanned out across 3 independent dimensions.
 * A single lead can land in up to 3 Resend Audiences simultaneously
 * (Resend Audiences are independent lists, not mutually exclusive).
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Dimension 1 — FUNNEL STAGE (drives the drip sequence)            │
 *   │   Trial / Top-100 PDF / Partner / Comparison                     │
 *   │                                                                  │
 *   │ Dimension 2 — INDUSTRY / ROLE (drives broadcast targeting)       │
 *   │   Freight Forwarders / Brokers / NVOCCs / 3PLs                   │
 *   │                                                                  │
 *   │ Dimension 3 — ACQUISITION CHANNEL (drives broadcast targeting)   │
 *   │   PPC / SEO / Social / Direct                                    │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Funnel stage ALWAYS resolves (defaults to Trial). Industry + Channel
 * resolve when the signal is present; otherwise null.
 *
 * Audience IDs are configured per environment. When an env var is unset
 * we return `audienceId: null` and the route SKIPS that audience-add —
 * audience-add never fails the lead capture.
 */

import type { SequenceKey } from "./lead-sequences";

export type AudienceEntry = {
  /** Resend audience id (aud_XXXX). null when env var is unset. */
  audienceId: string | null;
  /** Human-readable label, mainly for logs/observability. */
  label: string;
};

export type FunnelEntry = AudienceEntry & {
  /** Sequence key to enroll the lead into. */
  sequenceKey: SequenceKey;
};

export type AudienceResolution = {
  /** Always present. Drives drip sequence. */
  funnel: FunnelEntry;
  /** Present when the source page maps to a freight role. */
  industry: AudienceEntry | null;
  /** Present when utm or referrer signals an acquisition channel. */
  channel: AudienceEntry | null;
  /** Flattened convenience: all non-null audience ids the lead joins. */
  audienceIds: string[];
  /** Flattened convenience: all labels (for logs). */
  labels: string[];
};

export type AudienceSignals = {
  source: string;
  offer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  /** Explicit role hint when a form has a role picker. */
  role?: string;
};

const COMPARISON_PREFIXES = [
  "customers-",
  "vs-",
  "alternatives-",
  "best-",
] as const;

// ─── Industry / role inference ──────────────────────────────────────────
// We infer from (a) explicit `role` hint, (b) the `source` value the page
// emitted. Source prefixes follow the convention
// `solutions-<role>-hero|sticky|final` set in marketing/app/solutions/[slug]/page.tsx.

type IndustryKey = "forwarders" | "brokers" | "nvoccs" | "3pls";

const INDUSTRY_FROM_ROLE: Record<string, IndustryKey> = {
  forwarder: "forwarders",
  forwarders: "forwarders",
  "freight-forwarder": "forwarders",
  "freight-forwarders": "forwarders",
  broker: "brokers",
  brokers: "brokers",
  "freight-broker": "brokers",
  "freight-brokers": "brokers",
  nvocc: "nvoccs",
  nvoccs: "nvoccs",
  "3pl": "3pls",
  "3pls": "3pls",
  "third-party-logistics": "3pls",
};

const INDUSTRY_FROM_SOURCE_PREFIX: { prefix: string; key: IndustryKey }[] = [
  { prefix: "solutions-freight-forwarders", key: "forwarders" },
  { prefix: "solutions-freight-brokers", key: "brokers" },
  { prefix: "solutions-nvoccs", key: "nvoccs" },
  { prefix: "solutions-3pls", key: "3pls" },
  { prefix: "forwarders-", key: "forwarders" },
  { prefix: "brokers-", key: "brokers" },
];

const INDUSTRY_AUDIENCE_ENV: Record<IndustryKey, string> = {
  forwarders: "RESEND_AUDIENCE_FORWARDERS",
  brokers: "RESEND_AUDIENCE_BROKERS",
  nvoccs: "RESEND_AUDIENCE_NVOCCS",
  "3pls": "RESEND_AUDIENCE_3PLS",
};

const INDUSTRY_LABEL: Record<IndustryKey, string> = {
  forwarders: "LIT — Freight Forwarders",
  brokers: "LIT — Freight Brokers",
  nvoccs: "LIT — NVOCCs",
  "3pls": "LIT — 3PLs",
};

function resolveIndustry(s: AudienceSignals): AudienceEntry | null {
  let key: IndustryKey | null = null;

  if (s.role) {
    const k = INDUSTRY_FROM_ROLE[s.role.toLowerCase()];
    if (k) key = k;
  }
  if (!key) {
    const src = (s.source ?? "").toLowerCase();
    const hit = INDUSTRY_FROM_SOURCE_PREFIX.find((m) => src.startsWith(m.prefix));
    if (hit) key = hit.key;
  }
  if (!key) return null;

  return {
    audienceId: process.env[INDUSTRY_AUDIENCE_ENV[key]] ?? null,
    label: INDUSTRY_LABEL[key],
  };
}

// ─── Channel inference ──────────────────────────────────────────────────
// Order of evidence:
//   1. utm_source / utm_medium explicit
//   2. document.referrer (passed in by the client)
//   3. nothing → Direct/Referral

type ChannelKey = "ppc" | "seo" | "social" | "direct";

const PPC_UTM_SOURCES = new Set([
  "google-ads",
  "googleads",
  "google_ads",
  "google",
  "linkedin-ads",
  "linkedinads",
  "linkedin_ads",
  "meta-ads",
  "facebook-ads",
  "fb-ads",
  "bing-ads",
  "bingads",
  "microsoft-ads",
  "twitter-ads",
  "x-ads",
  "tiktok-ads",
]);
const PPC_UTM_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid-social", "paid_social", "display"]);

const SOCIAL_UTM_SOURCES = new Set([
  "linkedin",
  "twitter",
  "x",
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "threads",
  "reddit",
]);
const SOCIAL_UTM_MEDIUMS = new Set(["social", "organic-social", "organic_social"]);

const SEO_REFERRER_HOSTS = [
  "google.com",
  "www.google.com",
  "google.co.uk",
  "google.ca",
  "bing.com",
  "www.bing.com",
  "duckduckgo.com",
  "search.brave.com",
  "yahoo.com",
  "search.yahoo.com",
  "ecosia.org",
];
const SOCIAL_REFERRER_HOSTS = [
  "linkedin.com",
  "www.linkedin.com",
  "lnkd.in",
  "twitter.com",
  "x.com",
  "t.co",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "facebook.com",
  "m.facebook.com",
  "instagram.com",
  "reddit.com",
];

const CHANNEL_AUDIENCE_ENV: Record<ChannelKey, string> = {
  ppc: "RESEND_AUDIENCE_PPC",
  seo: "RESEND_AUDIENCE_SEO",
  social: "RESEND_AUDIENCE_SOCIAL",
  direct: "RESEND_AUDIENCE_DIRECT",
};

const CHANNEL_LABEL: Record<ChannelKey, string> = {
  ppc: "LIT — PPC Inbound",
  seo: "LIT — SEO Inbound",
  social: "LIT — Social Inbound",
  direct: "LIT — Direct / Referral",
};

function extractHost(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function resolveChannel(s: AudienceSignals): AudienceEntry | null {
  const utmSource = (s.utmSource ?? "").toLowerCase().trim();
  const utmMedium = (s.utmMedium ?? "").toLowerCase().trim();

  // 1. Explicit paid signal
  if (utmSource && (PPC_UTM_SOURCES.has(utmSource) || PPC_UTM_MEDIUMS.has(utmMedium))) {
    return { audienceId: process.env[CHANNEL_AUDIENCE_ENV.ppc] ?? null, label: CHANNEL_LABEL.ppc };
  }
  if (utmMedium && PPC_UTM_MEDIUMS.has(utmMedium)) {
    return { audienceId: process.env[CHANNEL_AUDIENCE_ENV.ppc] ?? null, label: CHANNEL_LABEL.ppc };
  }

  // 2. Explicit social signal
  if (utmSource && (SOCIAL_UTM_SOURCES.has(utmSource) || SOCIAL_UTM_MEDIUMS.has(utmMedium))) {
    return { audienceId: process.env[CHANNEL_AUDIENCE_ENV.social] ?? null, label: CHANNEL_LABEL.social };
  }
  if (utmMedium && SOCIAL_UTM_MEDIUMS.has(utmMedium)) {
    return { audienceId: process.env[CHANNEL_AUDIENCE_ENV.social] ?? null, label: CHANNEL_LABEL.social };
  }

  // 3. Referrer-based — falls back to SEO or Social
  if (s.referrer) {
    const host = extractHost(s.referrer);
    if (host) {
      if (SEO_REFERRER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        return { audienceId: process.env[CHANNEL_AUDIENCE_ENV.seo] ?? null, label: CHANNEL_LABEL.seo };
      }
      if (SOCIAL_REFERRER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        return { audienceId: process.env[CHANNEL_AUDIENCE_ENV.social] ?? null, label: CHANNEL_LABEL.social };
      }
      // External referrer not matching SEO/Social → Direct/Referral bucket
      return { audienceId: process.env[CHANNEL_AUDIENCE_ENV.direct] ?? null, label: CHANNEL_LABEL.direct };
    }
  }

  // 4. No signal at all → Direct
  return { audienceId: process.env[CHANNEL_AUDIENCE_ENV.direct] ?? null, label: CHANNEL_LABEL.direct };
}

// ─── Funnel stage (the existing 4-audience logic, unchanged) ────────────

function resolveFunnel(s: AudienceSignals): FunnelEntry {
  const normalizedSource = (s.source ?? "").toLowerCase();
  const normalizedOffer = (s.offer ?? "").toLowerCase();

  if (normalizedOffer === "top-100-shippers-pdf") {
    return {
      audienceId: process.env.RESEND_AUDIENCE_TOP_100_PDF ?? null,
      sequenceKey: "top-100-followup",
      label: "LIT — Top-100 PDF Leads",
    };
  }
  if (normalizedSource.startsWith("partners-")) {
    return {
      audienceId: process.env.RESEND_AUDIENCE_PARTNERS ?? null,
      sequenceKey: "partner-onboarding",
      label: "LIT — Partner Applicants",
    };
  }
  if (COMPARISON_PREFIXES.some((p) => normalizedSource.startsWith(p))) {
    return {
      audienceId: process.env.RESEND_AUDIENCE_COMPARISON ?? null,
      sequenceKey: "comparison-nurture",
      label: "LIT — Comparison Researchers",
    };
  }
  return {
    audienceId: process.env.RESEND_AUDIENCE_TRIAL_LEADS ?? null,
    sequenceKey: "trial-welcome",
    label: "LIT — Trial Leads",
  };
}

// ─── Public API ─────────────────────────────────────────────────────────

export function resolveAudience(
  sourceOrSignals: string | AudienceSignals,
  offer?: string,
): AudienceResolution {
  const signals: AudienceSignals =
    typeof sourceOrSignals === "string"
      ? { source: sourceOrSignals, offer }
      : sourceOrSignals;

  const funnel = resolveFunnel(signals);
  const industry = resolveIndustry(signals);
  const channel = resolveChannel(signals);

  const audienceIds = [
    funnel.audienceId,
    industry?.audienceId ?? null,
    channel?.audienceId ?? null,
  ].filter((x): x is string => !!x);

  const labels = [funnel.label, industry?.label, channel?.label].filter(
    (x): x is string => !!x,
  );

  return { funnel, industry, channel, audienceIds, labels };
}
