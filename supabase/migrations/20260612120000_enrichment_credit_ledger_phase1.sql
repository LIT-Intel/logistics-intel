/*
  # Enrichment Phase 1: credit-based plan model.

  Why: Apollo charges 1 export credit per email unlock (~$0.05-0.20) and 10
  credits per mobile phone unlock (~$0.50-2.00). The existing feature-counted
  enrichment cap doesn't distinguish between the two. Before Phase 3 turns
  on phone unlocks we need a credit ledger that can charge 10x for phones
  without a separate schema migration.

  Shipped:
    1) lit_credit_ledger — append-only ledger of credit consumption.
    2) plans.monthly_credit_quota — per-plan monthly credit cap (NULL = unlimited).
    3) lit_consume_credits(p_action, p_credits, p_metadata) — gate + log RPC.
    4) lit_get_credit_usage(p_org_id, p_user_id) — read-only summary for UI.

  Quota values (Phase 1):
    free_trial: 0           (gated entirely — Phase 3 will open paid trials)
    starter:    100         (= 100 emails OR 10 phones at Phase 3)
    growth:     2000
    scale:      10000
    enterprise: NULL        (unlimited)

  Edge fns calling this:
    - apollo-contact-enrich:  enrich_email at 1 credit/contact
    - lusha-enrichment:       enrich_email at 1 credit/contact

  Phase 3 will add:
    - enrich_phone / enrich_mobile at 10 credits/contact
    - dedicated phone-unlock UI affordance

  RLS:
    - SELECT: org members can read their org's ledger.
    - INSERT/UPDATE/DELETE: service-role only (edge fns use service-role).

  Note: this migration mirrors the live schema applied via MCP on
  jkmrfiaefxwgbvftohrb 2026-06-12. CREATE IF NOT EXISTS / OR REPLACE
  keep it idempotent if re-applied.
*/

-- ============================================================================
-- 1. lit_credit_ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS lit_credit_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  credits     integer NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lit_credit_ledger_org_created
  ON lit_credit_ledger (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lit_credit_ledger_org_action_created
  ON lit_credit_ledger (org_id, action, created_at DESC);

ALTER TABLE lit_credit_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='lit_credit_ledger'
      AND policyname='Members can read their org credits'
  ) THEN
    CREATE POLICY "Members can read their org credits"
      ON lit_credit_ledger FOR SELECT TO authenticated
      USING (
        org_id IN (
          SELECT org_id FROM org_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 2. plans.monthly_credit_quota
-- ============================================================================
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS monthly_credit_quota integer;

UPDATE plans SET monthly_credit_quota = 0     WHERE code = 'free_trial';
UPDATE plans SET monthly_credit_quota = 100   WHERE code = 'starter';
UPDATE plans SET monthly_credit_quota = 2000  WHERE code = 'growth';
UPDATE plans SET monthly_credit_quota = 10000 WHERE code = 'scale';
UPDATE plans SET monthly_credit_quota = NULL  WHERE code = 'enterprise';

-- ============================================================================
-- 3. lit_consume_credits RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.lit_consume_credits(
  p_action  text,
  p_credits integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_org_id        uuid;
  v_plan_code     text;
  v_quota         integer;
  v_used          integer := 0;
  v_period_start  timestamptz := date_trunc('month', now());
  v_period_end    timestamptz := date_trunc('month', now()) + INTERVAL '1 month';
BEGIN
  IF p_action NOT IN ('enrich_email','enrich_phone','enrich_mobile','enrich_company','manual_grant','rollback') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action', 'action', p_action);
  END IF;

  IF p_credits IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_credits');
  END IF;

  IF v_user_id IS NULL THEN
    v_user_id := NULLIF(p_metadata->>'user_id', '')::uuid;
    v_org_id  := NULLIF(p_metadata->>'org_id',  '')::uuid;
  END IF;

  IF v_org_id IS NULL AND v_user_id IS NOT NULL THEN
    SELECT org_id INTO v_org_id
      FROM org_members
     WHERE user_id = v_user_id
     ORDER BY joined_at ASC
     LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_org');
  END IF;

  v_plan_code := public.resolve_plan_code(v_org_id, v_user_id);
  SELECT monthly_credit_quota INTO v_quota FROM plans WHERE code = v_plan_code LIMIT 1;

  SELECT COALESCE(SUM(credits), 0)::integer INTO v_used
    FROM lit_credit_ledger
   WHERE org_id = v_org_id
     AND action NOT IN ('manual_grant','rollback')
     AND created_at >= v_period_start
     AND created_at <  v_period_end;

  IF p_action IN ('manual_grant','rollback') THEN
    INSERT INTO lit_credit_ledger (org_id, user_id, action, credits, metadata)
    VALUES (v_org_id, v_user_id, p_action, p_credits, COALESCE(p_metadata, '{}'::jsonb));
    RETURN jsonb_build_object(
      'ok', true,
      'used', v_used,
      'quota', v_quota,
      'remaining', CASE WHEN v_quota IS NULL THEN NULL ELSE v_quota - v_used END
    );
  END IF;

  IF v_quota IS NULL THEN
    INSERT INTO lit_credit_ledger (org_id, user_id, action, credits, metadata)
    VALUES (v_org_id, v_user_id, p_action, p_credits, COALESCE(p_metadata, '{}'::jsonb));
    RETURN jsonb_build_object('ok', true, 'used', v_used + p_credits, 'quota', NULL, 'remaining', NULL);
  END IF;

  IF (v_used + p_credits) > v_quota THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'quota_exceeded',
      'used', v_used,
      'quota', v_quota,
      'remaining', GREATEST(0, v_quota - v_used),
      'plan', v_plan_code
    );
  END IF;

  INSERT INTO lit_credit_ledger (org_id, user_id, action, credits, metadata)
  VALUES (v_org_id, v_user_id, p_action, p_credits, COALESCE(p_metadata, '{}'::jsonb));

  RETURN jsonb_build_object(
    'ok', true,
    'used', v_used + p_credits,
    'quota', v_quota,
    'remaining', v_quota - (v_used + p_credits),
    'plan', v_plan_code
  );
END;
$$;

-- ============================================================================
-- 4. lit_get_credit_usage RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.lit_get_credit_usage(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code    text;
  v_quota        integer;
  v_used         integer := 0;
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end   timestamptz := date_trunc('month', now()) + INTERVAL '1 month';
BEGIN
  v_plan_code := public.resolve_plan_code(p_org_id, p_user_id);
  SELECT monthly_credit_quota INTO v_quota FROM plans WHERE code = v_plan_code LIMIT 1;

  IF p_org_id IS NOT NULL THEN
    SELECT COALESCE(SUM(credits), 0)::integer INTO v_used
      FROM lit_credit_ledger
     WHERE org_id = p_org_id
       AND action NOT IN ('manual_grant','rollback')
       AND created_at >= v_period_start
       AND created_at <  v_period_end;
  END IF;

  RETURN jsonb_build_object(
    'used_this_month', v_used,
    'quota', v_quota,
    'remaining', CASE WHEN v_quota IS NULL THEN NULL ELSE GREATEST(0, v_quota - v_used) END,
    'reset_at', v_period_end,
    'plan', v_plan_code
  );
END;
$$;

-- ============================================================================
-- 5. Grants
-- ============================================================================
REVOKE ALL ON FUNCTION public.lit_consume_credits(text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lit_get_credit_usage(uuid, uuid)          FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.lit_consume_credits(text, integer, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.lit_get_credit_usage(uuid, uuid)          TO service_role, authenticated;
