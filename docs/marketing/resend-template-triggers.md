# Resend Template Triggers — 15 Templates

Maps every Resend template env var to the user action that fires it, the source values that route there, the delay after capture, and the sequence key.

Source-resolution logic lives in `marketing/lib/resend-audiences.ts` (`resolveAudience` → `resolveFunnel`). Step timing lives in `marketing/lib/lead-sequences.ts` (`SEQUENCES`). Step 1 of each sequence is sent inline by the lead-capture route; steps 2+ are enqueued into `public.lit_lead_sequence_queue` and dispatched by a cron drain.

## A. Trial Welcome

`funnel.sequenceKey = "trial-welcome"` — the default. Anything that does NOT match Top-100 / Partner / Comparison rules ends up here.

| # | Template env var | Trigger | Source values that route here | Hours after trigger | Sequence key |
|---|---|---|---|---|---|
| 1 | `RESEND_TPL_TRIAL_WELCOME` | Inline send on any free-trial form submit | `freight-leads-hero`, `freight-leads-sticky`, `freight-leads-final`, `solutions-freight-forwarders-*`, `solutions-freight-brokers-*`, `solutions-nvoccs-*`, `solutions-3pls-*`, `customers-final`, plus any source not matching Top-100/Partner/Comparison rules | 0 (inline) | `trial-welcome` |
| 2 | `RESEND_TPL_TRIAL_DAY_2` | Cron drain — fires for every trial lead 48h after capture, regardless of activation state | n/a (cron-fired) | 48 | `trial-welcome` |
| 3 | `RESEND_TPL_TRIAL_DAY_5` | Cron drain — fires for every trial lead 120h after capture | n/a (cron-fired) | 120 | `trial-welcome` |
| 4 | `RESEND_TPL_TRIAL_DAY_9` | Cron drain — fires for every trial lead 216h after capture (demo nudge before trial expiry) | n/a (cron-fired) | 216 | `trial-welcome` |
| 5 | `RESEND_TPL_TRIAL_DAY_14` | Cron drain — fires for every trial lead 336h after capture (trial-end recap + upgrade CTA) | n/a (cron-fired) | 336 | `trial-welcome` |

## B. Top-100 PDF

`funnel.sequenceKey = "top-100-followup"` — triggered when `offer === "top-100-shippers-pdf"` (case-insensitive).

| # | Template env var | Trigger | Source values that route here | Hours after trigger | Sequence key |
|---|---|---|---|---|---|
| 1 | `RESEND_TPL_TOP_100_DELIVERY` | Inline send on form submit with `offer=top-100-shippers-pdf` (the exit-intent modal and any "download the PDF" CTA on money pages) | Any source — the routing key is `offer`, not `source` | 0 (inline) | `top-100-followup` |
| 2 | `RESEND_TPL_TOP_100_DAY_3` | Cron drain — fires 72h after PDF delivery | n/a (cron-fired) | 72 | `top-100-followup` |
| 3 | `RESEND_TPL_TOP_100_DAY_7` | Cron drain — fires 168h after PDF delivery (convert PDF lead to trial) | n/a (cron-fired) | 168 | `top-100-followup` |

## C. Partner Onboarding

`funnel.sequenceKey = "partner-onboarding"` — triggered when `source.startsWith("partners-")`.

| # | Template env var | Trigger | Source values that route here | Hours after trigger | Sequence key |
|---|---|---|---|---|---|
| 1 | `RESEND_TPL_PARTNER_RECEIVED` | Inline send when partner application form submits | `partners-hero`, `partners-final`, `partners-apply`, any source starting `partners-` | 0 (inline) | `partner-onboarding` |
| 2 | `RESEND_TPL_PARTNER_APPROVED` | Cron drain — fires 48h after partner application (stand-in approval; see open question below) | n/a (cron-fired) | 48 | `partner-onboarding` |
| 3 | `RESEND_TPL_PARTNER_DAY_7` | Cron drain — fires 168h after partner application (coaching + tier-2 path) | n/a (cron-fired) | 168 | `partner-onboarding` |

## D. Comparison Nurture

`funnel.sequenceKey = "comparison-nurture"` — triggered when `source` starts with `customers-`, `vs-`, `alternatives-`, or `best-`. Cron resolves `{{competitor}}` from the source token (`vs-zoominfo-hero` → `ZoomInfo`, `alternatives-apollo` → `Apollo`). Fallback phrasing fires when the source carries no competitor token.

| # | Template env var | Trigger | Source values that route here | Hours after trigger | Sequence key |
|---|---|---|---|---|---|
| 1 | `RESEND_TPL_COMPARISON_WELCOME` | Inline send when a competitor / alternatives / best-of comparison page captures a lead | `vs-zoominfo-*`, `vs-importgenius-*`, `vs-panjiva-*`, `alternatives-apollo`, `alternatives-zoominfo`, `best-import-export-data-*`, `customers-final` (when routed via comparison rule) | 0 (inline) | `comparison-nurture` |
| 2 | `RESEND_TPL_COMPARISON_DAY_4` | Cron drain — fires 96h after comparison lead capture (churn-driver narrative) | n/a (cron-fired) | 96 | `comparison-nurture` |

## E. Re-Engagement

`funnel.sequenceKey = "re-engagement"` — NOT triggered by any form submit. Enrolled by a daily cron (`/api/cron/reengagement-enroll`, 16:00 UTC) that scans `lit_leads` for dormant addresses. Trigger color in the map: `gray-500` (muted/contemplative).

| # | Template env var | Trigger | Source values that route here | Hours after trigger | Sequence key |
|---|---|---|---|---|---|
| 1 | `RESEND_TPL_REENGAGE_WINBACK` | Daily cron enrolls leads with: lit_leads.created_at older than 30d, no 'opened' event in last 30d, not bounced/complained, not in unsubscribed_all. Enqueues both steps; step 1 fires on next dispatcher run. | n/a (cron-enrolled) — queue row's `source` is set to `re-engagement-cron` | 0 (cron-fired) | `re-engagement` |
| 2 | `RESEND_TPL_REENGAGE_FINAL` | Cron drain — fires 168h (7 days) after the winback step. Explicit "yes unsubscribe me / no keep me" two-button UX. | n/a (cron-fired) | 168 | `re-engagement` |

## Open questions / assumptions

1. **TRIAL_DAY_14 audience.** Current behavior in `lead-sequences.ts` enqueues all five steps at lead capture, so step 5 fires for every trial lead regardless of whether they activated or upgraded. The copy is written to handle both cases (recap + soft upgrade CTA + "tell us why" if it didn't fit). If we want to suppress step 5 for users who already converted, that's a cron-side guard (check `user_subscriptions.status` before dispatch), not a copy change.

2. **PARTNER_APPROVED at 48h.** The current sequence config fires this template via cron 48h after application — but the RECEIVED email says "we read it inside 48h and either approve or come back with a clarifying question," implying manual approval. Two ways to reconcile:
   - **A:** Leave as-is (auto-approve at 48h). Copy assumes approval. Manual rejections need an out-of-band send.
   - **B:** Move PARTNER_APPROVED to a manual trigger (admin clicks "approve" → fires the template) and replace the 48h slot with a holding email. Out of scope for this restyle — flagged for follow-up.

3. **`customers-final` routing.** `customers-final` is listed under both Trial (as the fallback) and Comparison (when the `customers-` prefix matches). `resolveFunnel` evaluates Top-100 → Partner → Comparison → Trial in order, so `customers-final` will resolve to comparison-nurture because of the `customers-` prefix match. If that's not the intent (e.g. final CTA on a customer-stories page should go to trial-welcome, not comparison), update `COMPARISON_PREFIXES` in `resend-audiences.ts` to require a longer/more specific prefix like `customers-vs-`. Not changed here — flagged for follow-up.

4. **Hero SVG injection.** The shell defines a `<!-- HERO -->` slot. The current `scripts/setup-resend-templates.cjs` only substitutes `<!-- BODY -->`. To wire heroes through, the script would need a per-template hero map (mirroring `frontend/src/features/outbound/data/starterTemplates.ts`'s `HEROES` registry). Until that lands, the shell renders with an empty hero row and the accent color carries the visual identity. Flagged for follow-up — the copy doc currently declares the intended `hero kind` and `accent` per template so the mapping is ready when the script is extended.
