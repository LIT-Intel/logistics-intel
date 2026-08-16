-- Phase 8 referral loop — admin summary RPC (platform-admin gated).
-- Per referrer: clicks, signups, activated, paid, credits issued, revenue
-- generated. Mirrors the gating pattern of lit_admin_growth_sprint_status.
CREATE OR REPLACE FUNCTION public.lit_admin_referral_summary()
RETURNS TABLE (
  referrer_user_id  uuid,
  referrer_email    text,
  ref_code          text,
  clicks            integer,
  signups           integer,
  activated         integer,
  paid              integer,
  credits_issued    integer,
  revenue_cents     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT ur.user_id AS referrer_user_id, ur.ref_code
      FROM public.lit_user_referrals ur
  ),
  clk AS (
    SELECT ref_code, COUNT(*)::int AS clicks
      FROM public.lit_referral_events
     WHERE event_type = 'clicked'
     GROUP BY ref_code
  ),
  rewards AS (
    SELECT rr.referrer_user_id,
           COUNT(*)::int AS signups,
           COUNT(*) FILTER (WHERE rr.status IN ('activated','rewarded'))::int AS activated,
           COALESCE(SUM(rr.credits) FILTER (WHERE rr.status = 'rewarded'),0)::int AS credits_issued,
           COUNT(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.lit_user_activation ua
                WHERE ua.user_id = rr.referred_user_id
                  AND ua.converted_paid_at IS NOT NULL
             )
           )::int AS paid,
           COALESCE(SUM(
             (SELECT COALESCE(afr.mrr_cents,0)
                FROM public.affiliate_referrals afr
               WHERE afr.referred_user_id = rr.referred_user_id
               LIMIT 1)
           ),0)::bigint AS revenue_cents
      FROM public.lit_referral_rewards rr
     GROUP BY rr.referrer_user_id
  )
  SELECT
    b.referrer_user_id,
    (SELECT u.email FROM auth.users u WHERE u.id = b.referrer_user_id) AS referrer_email,
    b.ref_code,
    COALESCE(clk.clicks, 0) AS clicks,
    COALESCE(rw.signups, 0) AS signups,
    COALESCE(rw.activated, 0) AS activated,
    COALESCE(rw.paid, 0) AS paid,
    COALESCE(rw.credits_issued, 0) AS credits_issued,
    COALESCE(rw.revenue_cents, 0) AS revenue_cents
  FROM base b
  LEFT JOIN clk     ON clk.ref_code = b.ref_code
  LEFT JOIN rewards rw ON rw.referrer_user_id = b.referrer_user_id
  ORDER BY COALESCE(rw.credits_issued,0) DESC, COALESCE(rw.signups,0) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.lit_admin_referral_summary() FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_referral_summary() TO authenticated;
