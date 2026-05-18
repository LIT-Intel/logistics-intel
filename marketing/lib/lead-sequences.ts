/**
 * Lead nurture sequence definitions.
 *
 * Each sequence is a declarative list of steps. The lead-capture route
 * (POST /api/leads/resend) enqueues every step (other than the inline
 * welcome send — see route comment) into `public.lit_lead_sequence_queue`
 * with `send_at = now + delayHours`. A separate cron worker drains the
 * queue and dispatches the actual emails via Resend.
 *
 * Template IDs are resolved AT DISPATCH TIME from `process.env[envTemplateVar]`
 * by the cron — NOT here. That way the dashboard can rotate template IDs
 * without a redeploy. The `templateId` field on this constant is always
 * `null` at the source; populate it lazily if you need a snapshot.
 *
 * Merge placeholders:
 *   {{competitor}} — used by the "comparison-nurture" sequence. The cron
 *     resolves this from the lead's `source` field, e.g.
 *       source="vs-zoominfo-hero"           → competitor="ZoomInfo"
 *       source="alternatives-apollo"        → competitor="Apollo"
 *       source="best-import-export-data..." → competitor="" (skip token)
 *     If the source doesn't carry a competitor token, the cron should
 *     fall back to a generic phrasing.
 */

export type SequenceKey =
  | "trial-welcome"
  | "top-100-followup"
  | "partner-onboarding"
  | "comparison-nurture";

export type SequenceStep = {
  /** 1-indexed step number, unique within a sequence. */
  step: number;
  /** Hours after lead capture to send this step. 0 = immediate. */
  delayHours: number;
  /** Resend template id, resolved lazily from env. Always null at source. */
  templateId: string | null;
  /** Env var name the cron should read for the template id. */
  envTemplateVar: string;
  /** Fallback subject line when no template is configured. */
  subject: string;
  /** Human-readable docstring describing the purpose of this step. */
  purpose: string;
};

export const SEQUENCES: Record<SequenceKey, SequenceStep[]> = {
  "trial-welcome": [
    {
      step: 1,
      delayHours: 0,
      envTemplateVar: "RESEND_TPL_TRIAL_WELCOME",
      templateId: null,
      subject:
        "Your LIT trial is ready — 10 searches + 10 verified contacts",
      purpose: "Welcome + onboarding CTA",
    },
    {
      step: 2,
      delayHours: 48,
      envTemplateVar: "RESEND_TPL_TRIAL_DAY_2",
      templateId: null,
      subject: "How forwarders book 4× more meetings with LIT",
      purpose: "Social proof + featured case study",
    },
    {
      step: 3,
      delayHours: 120,
      envTemplateVar: "RESEND_TPL_TRIAL_DAY_5",
      templateId: null,
      subject: "Your free searches expire in 9 days",
      purpose: "Trial reminder + value recap",
    },
    {
      step: 4,
      delayHours: 216,
      envTemplateVar: "RESEND_TPL_TRIAL_DAY_9",
      templateId: null,
      subject: "Want a 30-min walkthrough on your lanes?",
      purpose: "Demo nudge before trial expiry",
    },
    {
      step: 5,
      delayHours: 336,
      envTemplateVar: "RESEND_TPL_TRIAL_DAY_14",
      templateId: null,
      subject: "Your LIT trial ended — here is what we built for you",
      purpose: "Trial recap + upgrade CTA",
    },
  ],
  "top-100-followup": [
    {
      step: 1,
      delayHours: 0,
      envTemplateVar: "RESEND_TPL_TOP_100_DELIVERY",
      templateId: null,
      subject: "Top 100 active shippers in your lane (this week's data)",
      purpose: "Deliver the PDF + start trial CTA",
    },
    {
      step: 2,
      delayHours: 72,
      envTemplateVar: "RESEND_TPL_TOP_100_DAY_3",
      templateId: null,
      subject: "The 6 things every freight rep does with the top-100 list",
      purpose: "Use-case nurture",
    },
    {
      step: 3,
      delayHours: 168,
      envTemplateVar: "RESEND_TPL_TOP_100_DAY_7",
      templateId: null,
      subject: "What if you had this list refreshed every Monday?",
      purpose: "Convert PDF lead to trial",
    },
  ],
  "partner-onboarding": [
    {
      step: 1,
      delayHours: 0,
      envTemplateVar: "RESEND_TPL_PARTNER_RECEIVED",
      templateId: null,
      subject: "We got your LIT partner application — what happens next",
      purpose: "Acknowledge application + 48h timeline",
    },
    {
      step: 2,
      delayHours: 48,
      envTemplateVar: "RESEND_TPL_PARTNER_APPROVED",
      templateId: null,
      subject: "Your LIT partner link is live — start earning 15%",
      purpose: "Approval + first link + first-customer playbook",
    },
    {
      step: 3,
      delayHours: 168,
      envTemplateVar: "RESEND_TPL_PARTNER_DAY_7",
      templateId: null,
      subject: "Partner tips: the 3 audiences that convert fastest",
      purpose: "Coaching + tier-2 path",
    },
  ],
  "comparison-nurture": [
    {
      step: 1,
      delayHours: 0,
      envTemplateVar: "RESEND_TPL_COMPARISON_WELCOME",
      templateId: null,
      subject:
        "Side-by-side: LIT vs {{competitor}} — the version we never publish",
      purpose: "Honest pros/cons + free trial CTA",
    },
    {
      step: 2,
      delayHours: 96,
      envTemplateVar: "RESEND_TPL_COMPARISON_DAY_4",
      templateId: null,
      subject: "Why teams leave {{competitor}} after 6 months",
      purpose: "Churn-driver narrative + customer quote",
    },
  ],
};
