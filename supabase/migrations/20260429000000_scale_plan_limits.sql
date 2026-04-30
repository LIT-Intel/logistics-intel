/*
  # Scale plan limits — align DB to canonical catalog (decision: 2026-04-29)

  The `plans` table already has the Scale row with the correct $625/mo
  price (added when the new Stripe products were provisioned), but every
  numeric limit defaulted to 0 — which would block Scale customers from
  doing anything. This migration sets Scale's per-feature limits to the
  values approved in the Billing Truth plan.

  Scale (per spec):
    - 5 seats included (display only — backend doesn't enforce seats yet)
    - 2,000 company searches / month
    - 1,500 saved companies (total, not monthly — `kind=total`)
    - 200 contact-enrichment credits / month
    - 250 Pulse briefs / month
    - 500 campaign emails / month
    - 100 PDF exports / month

  Starter and Growth limits are intentionally untouched in this migration
  — those rows already have non-zero limits enforcing real (if mildly
  out-of-spec) caps. Aligning them to spec is a separate follow-up so
  this commit stays focused on unblocking Scale.

  Idempotent: safe to run multiple times.
*/

UPDATE plans
   SET search_limit             = 2000,
       save_limit               = 1500,
       enrichment_limit         = 200,
       pulse_briefs_per_month   = 250,
       exports_per_month        = 100,
       campaign_sends_per_month = 500,
       enrichment_enabled       = true,
       campaigns_enabled        = true,
       updated_at               = now()
 WHERE code = 'scale';
