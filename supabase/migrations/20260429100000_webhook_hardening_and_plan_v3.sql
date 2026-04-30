/*
  # Webhook hardening + plan limits v3 (decision: 2026-04-29 P&L review)

  1) stripe_webhook_events: idempotency table for the Stripe webhook
     (billing-webhook). Keyed on the Stripe event.id. Service-role only;
     no authenticated read/write.

  2) plans.linkedin_touches_per_month: new column for LinkedIn outreach
     gating. NULL = unlimited (Enterprise) / not-yet-enforced.

  3) Plan limits rewrite per the new agreed catalog. Search caps tightened
     (Growth 1000 -> 750) because search is the highest variable cost
     surface and the previous numbers left too much API exposure. Pulse
     limits added per plan. Campaign volumes raised because email send is
     cheaper and drives conversion.

  4) resolve_feature_limit RPC extended with the `linkedin_touch` feature
     key so the existing check_usage_limit / consume_usage flow can gate
     LinkedIn touches once an integration ships.

  Idempotent: safe to run multiple times.
*/

-- ============================================================================
-- 1. stripe_webhook_events (idempotency)
-- ============================================================================

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id      text PRIMARY KEY,
  event_type    text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  processing_error text,
  payload_summary jsonb
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
  ON stripe_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_received
  ON stripe_webhook_events (event_type, received_at DESC);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No SELECT or INSERT policies for authenticated users — this audit table
-- is service-role only. Edge functions use the service-role key so RLS is
-- bypassed for them.

-- ============================================================================
-- 2. linkedin_touches_per_month column
-- ============================================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS linkedin_touches_per_month integer;

ALTER TABLE plans
  ALTER COLUMN linkedin_touches_per_month DROP NOT NULL;

-- ============================================================================
-- 3. Plan limits v3 (Starter / Growth / Scale / Enterprise / Free Trial)
--
--    Caps reflect the 2026-04-29 P&L decision:
--      - Search is the largest variable API cost; tightened across plans
--        (Growth 1000 -> 750, Scale stays at 2000).
--      - Pulse AI: free trial gets a small total allowance (3, treated as
--        per-month here since the trial expires when search/save run out
--        — the per-month cap effectively becomes a one-trial total).
--      - Campaign emails are cheap to send; raised across plans.
--      - LinkedIn touches enforced via the new column.
-- ============================================================================

-- Free trial: 10 search, 10 save, 0 enrichment, 3 pulse, 0 campaign,
--             0 export, 0 LinkedIn
UPDATE plans SET
  search_limit               = 10,
  save_limit                 = 10,
  enrichment_limit           = 0,
  pulse_briefs_per_month     = 3,
  campaign_sends_per_month   = 0,
  exports_per_month          = 0,
  linkedin_touches_per_month = 0,
  updated_at                 = now()
WHERE code = 'free_trial';

-- Starter: tightened search + pulse, added campaigns + LinkedIn
UPDATE plans SET
  search_limit               = 100,
  enrichment_limit           = 0,
  pulse_briefs_per_month     = 10,
  campaign_sends_per_month   = 250,
  linkedin_touches_per_month = 75,
  updated_at                 = now()
WHERE code = 'starter';

-- Growth: search 1000 -> 750, Pulse 100 -> 35, Campaign 1000 (kept),
--         Enrichment 200 -> 75, LinkedIn 250
UPDATE plans SET
  search_limit               = 750,
  enrichment_limit           = 75,
  pulse_briefs_per_month     = 35,
  campaign_sends_per_month   = 1000,
  linkedin_touches_per_month = 250,
  updated_at                 = now()
WHERE code = 'growth';

-- Scale: search 2000 (kept), Pulse 250 -> 80, Campaign 500 -> 2500,
--        Enrichment 200 (kept), LinkedIn 750
UPDATE plans SET
  search_limit               = 2000,
  enrichment_limit           = 200,
  pulse_briefs_per_month     = 80,
  campaign_sends_per_month   = 2500,
  linkedin_touches_per_month = 750,
  updated_at                 = now()
WHERE code = 'scale';

-- Enterprise stays NULL (unlimited / custom).
UPDATE plans SET
  linkedin_touches_per_month = NULL,
  updated_at                 = now()
WHERE code = 'enterprise';

-- ============================================================================
-- 4. resolve_feature_limit: add 'linkedin_touch' feature key
--
--    check_usage_limit / consume_usage already work for any feature key
--    that resolve_feature_limit understands. Adding 'linkedin_touch' here
--    means an Edge Function can call:
--      check_usage_limit(p_org_id, p_user_id, 'linkedin_touch', 1)
--    once a LinkedIn-touch surface ships, and it will gate against the
--    new `linkedin_touches_per_month` column.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_feature_limit(
  p_plan_code text,
  p_feature_key text
)
RETURNS TABLE (limit_value integer, kind text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM plans WHERE code = p_plan_code LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM plans WHERE code = 'free_trial' LIMIT 1;
  END IF;

  CASE p_feature_key
    WHEN 'company_search'       THEN limit_value := v_plan.search_limit;             kind := 'monthly';
    WHEN 'company_profile_view' THEN limit_value := v_plan.search_limit;             kind := 'monthly';
    WHEN 'saved_company'        THEN limit_value := v_plan.save_limit;               kind := 'total';
    WHEN 'contact_enrichment'   THEN limit_value := v_plan.enrichment_limit;         kind := 'monthly';
    WHEN 'pulse_brief'          THEN limit_value := v_plan.pulse_briefs_per_month;   kind := 'monthly';
    WHEN 'export_pdf'           THEN limit_value := v_plan.exports_per_month;        kind := 'monthly';
    WHEN 'campaign_send'        THEN limit_value := v_plan.campaign_sends_per_month; kind := 'monthly';
    WHEN 'ai_brief'             THEN limit_value := v_plan.ai_brief_limit;           kind := 'monthly';
    WHEN 'linkedin_touch'       THEN limit_value := v_plan.linkedin_touches_per_month; kind := 'monthly';
    ELSE
      limit_value := NULL;
      kind := 'unknown';
  END CASE;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_feature_limit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_feature_limit(text, text) TO service_role, authenticated;
