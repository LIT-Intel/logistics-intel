/**
 * Mirror of marketing/lib/lead-sequences.ts — kept in the frontend so the
 * admin analytics page can label per-step events without cross-importing
 * across packages. Update both files together if a sequence step changes.
 *
 * Single source of truth: marketing/lib/lead-sequences.ts (the cron worker
 * uses that one to actually dispatch). This is read-only metadata.
 */

export type SequenceKey =
  | "trial-welcome"
  | "top-100-followup"
  | "partner-onboarding"
  | "comparison-nurture";

export type SequenceStep = {
  step: number;
  delayHours: number;
  envTemplateVar: string;
  subject: string;
  purpose: string;
};

export const SEQUENCES: Record<SequenceKey, SequenceStep[]> = {
  "trial-welcome": [
    {
      step: 1,
      delayHours: 0,
      envTemplateVar: "RESEND_TPL_TRIAL_WELCOME",
      subject: "Your LIT trial is ready — 10 searches + 10 verified contacts",
      purpose: "Welcome + onboarding CTA",
    },
    {
      step: 2,
      delayHours: 48,
      envTemplateVar: "RESEND_TPL_TRIAL_DAY_2",
      subject: "How forwarders book 4× more meetings with LIT",
      purpose: "Social proof + featured case study",
    },
    {
      step: 3,
      delayHours: 120,
      envTemplateVar: "RESEND_TPL_TRIAL_DAY_5",
      subject: "Your free searches expire in 9 days",
      purpose: "Trial reminder + value recap",
    },
    {
      step: 4,
      delayHours: 216,
      envTemplateVar: "RESEND_TPL_TRIAL_DAY_9",
      subject: "Want a 30-min walkthrough on your lanes?",
      purpose: "Demo nudge before trial expiry",
    },
    {
      step: 5,
      delayHours: 336,
      envTemplateVar: "RESEND_TPL_TRIAL_DAY_14",
      subject: "Your LIT trial ended — here is what we built for you",
      purpose: "Trial recap + upgrade CTA",
    },
  ],
  "top-100-followup": [
    {
      step: 1,
      delayHours: 0,
      envTemplateVar: "RESEND_TPL_TOP_100_DELIVERY",
      subject: "Top 100 active shippers in your lane (this week's data)",
      purpose: "Deliver the PDF + start trial CTA",
    },
    {
      step: 2,
      delayHours: 72,
      envTemplateVar: "RESEND_TPL_TOP_100_DAY_3",
      subject: "The 6 things every freight rep does with the top-100 list",
      purpose: "Use-case nurture",
    },
    {
      step: 3,
      delayHours: 168,
      envTemplateVar: "RESEND_TPL_TOP_100_DAY_7",
      subject: "What if you had this list refreshed every Monday?",
      purpose: "Convert PDF lead to trial",
    },
  ],
  "partner-onboarding": [
    {
      step: 1,
      delayHours: 0,
      envTemplateVar: "RESEND_TPL_PARTNER_RECEIVED",
      subject: "We got your LIT partner application — what happens next",
      purpose: "Acknowledge application + 48h timeline",
    },
    {
      step: 2,
      delayHours: 48,
      envTemplateVar: "RESEND_TPL_PARTNER_APPROVED",
      subject: "Your LIT partner link is live — start earning 15%",
      purpose: "Approval + first link + first-customer playbook",
    },
    {
      step: 3,
      delayHours: 168,
      envTemplateVar: "RESEND_TPL_PARTNER_DAY_7",
      subject: "Partner tips: the 3 audiences that convert fastest",
      purpose: "Coaching + tier-2 path",
    },
  ],
  "comparison-nurture": [
    {
      step: 1,
      delayHours: 0,
      envTemplateVar: "RESEND_TPL_COMPARISON_WELCOME",
      subject:
        "Side-by-side: LIT vs {{competitor}} — the version we never publish",
      purpose: "Honest pros/cons + free trial CTA",
    },
    {
      step: 2,
      delayHours: 96,
      envTemplateVar: "RESEND_TPL_COMPARISON_DAY_4",
      subject: "Why teams leave {{competitor}} after 6 months",
      purpose: "Churn-driver narrative + customer quote",
    },
  ],
};
