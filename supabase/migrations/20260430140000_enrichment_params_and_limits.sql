-- Phase 5.1 D1 — Add enrichment caching to lit_companies + plan-based contact limits
ALTER TABLE lit_companies
  ADD COLUMN IF NOT EXISTS enrichment_params jsonb,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS revenue text,
  ADD COLUMN IF NOT EXISTS headcount text;

CREATE TABLE IF NOT EXISTS plan_contact_limits (
  plan_code text PRIMARY KEY,
  max_contacts_per_company int NOT NULL,
  monthly_enrichment_credits int NOT NULL
);

INSERT INTO plan_contact_limits (plan_code, max_contacts_per_company, monthly_enrichment_credits)
VALUES
  ('free_trial', 3, 15),
  ('starter', 5, 75),
  ('growth', 10, 150),
  ('scale', 25, 500)
ON CONFLICT (plan_code) DO UPDATE SET
  max_contacts_per_company = EXCLUDED.max_contacts_per_company,
  monthly_enrichment_credits = EXCLUDED.monthly_enrichment_credits;