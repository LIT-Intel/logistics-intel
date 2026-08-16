-- Phase 8 referral loop — RPCs.

-- Credits granted to the referrer when a referred user activates. Stored in
-- lit_internal_meta so the owner can tune without a code change. Default 25.
INSERT INTO public.lit_internal_meta (meta_key, meta_value)
VALUES ('referral_reward_credits', '25'::jsonb)
ON CONFLICT (meta_key) DO NOTHING;

-- ── ref_code generation in SQL ───────────────────────────────────────────────
-- Mirrors _shared/affiliate.ts generateRefCode: 8-char Crockford-ish base32,
-- alphabet excludes I/L/O/U/0/1. Uniqueness checked across BOTH ref-code
-- namespaces (affiliate_partners + lit_user_referrals) so a single
-- /?ref=<code> lookup is never ambiguous.
CREATE OR REPLACE FUNCTION public._lit_gen_ref_code(p_len integer DEFAULT 8)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  out text := '';
  i integer;
BEGIN
  FOR i IN 1..p_len LOOP
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN out;
END;
$$;

-- Get (or lazily mint) the caller's member referral code. Idempotent. Excludes
-- internal/suspended users from minting. Logs referral_link_created once.
CREATE OR REPLACE FUNCTION public.lit_get_or_create_referral_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code    text;
  v_attempt integer;
  v_exists  boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  SELECT ref_code INTO v_code FROM public.lit_user_referrals WHERE user_id = v_user_id;
  IF v_code IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ref_code', v_code, 'created', false);
  END IF;

  IF public.is_internal_user(v_user_id) OR public.is_suspended_or_banned(v_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ineligible');
  END IF;

  FOR v_attempt IN 1..8 LOOP
    v_code := public._lit_gen_ref_code(8);
    SELECT EXISTS(
      SELECT 1 FROM public.affiliate_partners  WHERE ref_code = v_code
      UNION ALL
      SELECT 1 FROM public.lit_user_referrals  WHERE ref_code = v_code
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_code := NULL;
  END LOOP;

  IF v_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'alloc_failed');
  END IF;

  INSERT INTO public.lit_user_referrals (user_id, ref_code)
  VALUES (v_user_id, v_code)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
  RETURNING ref_code INTO v_code;

  INSERT INTO public.lit_referral_events (event_type, ref_code, referrer_user_id)
  VALUES ('referral_link_created', v_code, v_user_id);

  RETURN jsonb_build_object('ok', true, 'ref_code', v_code, 'created', true);
END;
$$;

-- ── Activation → reward processor ────────────────────────────────────────────
-- Issues the referrer intelligence credits once the referred user reaches
-- activation (first_search_at OR first_save_at). Idempotent (one reward row per
-- referred user; only pending→rewarded does work). Excludes internal/suspended
-- on both sides. Records the reward + a tagged lit_credit_ledger row.
--
-- CREDIT REDEMPTION (flagged for owner): the live model (lit_get_credit_usage /
-- lit_consume_credits) computes remaining = plan.monthly_credit_quota - burn,
-- and EXCLUDES 'manual_grant' rows from burn. So a positive grant row is
-- recorded but does NOT yet add redeemable headroom. We record truthfully;
-- making the grant redeemable needs a small change to lit_get_credit_usage
-- (subtract SUM(manual_grant credits) from used). Left for the owner.
CREATE OR REPLACE FUNCTION public.process_referral_rewards(p_referred_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_credits integer;
  v_rewarded integer := 0;
  r RECORD;
  v_org_id uuid;
BEGIN
  SELECT COALESCE(NULLIF(meta_value::text,'null')::int, 25) INTO v_credits
    FROM public.lit_internal_meta WHERE meta_key = 'referral_reward_credits';
  IF v_credits IS NULL THEN v_credits := 25; END IF;

  FOR r IN
    SELECT rr.id, rr.referrer_user_id, rr.referred_user_id, rr.ref_code,
           COALESCE(ua.first_search_at, ua.first_save_at) AS activated_at
      FROM public.lit_referral_rewards rr
      JOIN public.lit_user_activation ua ON ua.user_id = rr.referred_user_id
     WHERE rr.status = 'pending'
       AND (p_referred_user_id IS NULL OR rr.referred_user_id = p_referred_user_id)
       AND (ua.first_search_at IS NOT NULL OR ua.first_save_at IS NOT NULL)
       AND NOT public.is_internal_user(rr.referred_user_id)
       AND NOT public.is_suspended_or_banned(rr.referred_user_id)
       AND NOT public.is_internal_user(rr.referrer_user_id)
       AND NOT public.is_suspended_or_banned(rr.referrer_user_id)
  LOOP
    SELECT org_id INTO v_org_id
      FROM public.org_members WHERE user_id = r.referrer_user_id
      ORDER BY joined_at ASC LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.lit_credit_ledger (org_id, user_id, action, credits, metadata)
      VALUES (
        v_org_id, r.referrer_user_id, 'manual_grant', v_credits,
        jsonb_build_object(
          'source', 'referral_reward',
          'referred_user_id', r.referred_user_id,
          'ref_code', r.ref_code,
          'reward_id', r.id
        )
      );
    END IF;

    UPDATE public.lit_referral_rewards
       SET status = 'rewarded',
           credits = v_credits,
           activated_at = COALESCE(activated_at, r.activated_at, now()),
           rewarded_at = now(),
           updated_at = now()
     WHERE id = r.id AND status = 'pending';

    INSERT INTO public.lit_referral_events
      (event_type, ref_code, referrer_user_id, referred_user_id, metadata)
    VALUES
      ('reward_issued', r.ref_code, r.referrer_user_id, r.referred_user_id,
       jsonb_build_object('credits', v_credits, 'org_id', v_org_id));

    v_rewarded := v_rewarded + 1;
  END LOOP;

  RETURN v_rewarded;
END;
$$;

REVOKE ALL ON FUNCTION public.lit_get_or_create_referral_code() FROM public;
GRANT EXECUTE ON FUNCTION public.lit_get_or_create_referral_code() TO authenticated;
-- process_referral_rewards is service/cron/admin only — not granted to end users.
REVOKE ALL ON FUNCTION public.process_referral_rewards(uuid) FROM public;
