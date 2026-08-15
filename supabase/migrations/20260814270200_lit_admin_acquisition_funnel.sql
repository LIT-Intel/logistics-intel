-- Phase 3 Activation & Attribution: 3/5 first-touch acquisition funnel (source -> funnel + new MRR)
-- Admin-gated via SECURITY DEFINER function that checks is_platform_admin(auth.uid()).
CREATE OR REPLACE FUNCTION public.lit_admin_acquisition_funnel()
RETURNS TABLE (
  source        text,
  signups       bigint,
  searched      bigint,
  saved         bigint,
  trial_started bigint,
  converted     bigint,
  new_mrr       numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    COALESCE(ua.signup_source, 'direct/unknown') AS source,
    count(*)                                              AS signups,
    count(ua.first_search_at)                             AS searched,
    count(ua.first_save_at)                               AS saved,
    count(ua.trial_started_at)                            AS trial_started,
    count(ua.converted_paid_at)                           AS converted,
    -- new MRR from converted users: join plan price (monthly, or yearly/12). Enterprise price is null in plans.
    COALESCE(SUM(
      CASE WHEN ua.converted_paid_at IS NOT NULL THEN
        CASE WHEN p.billing_interval = 'yearly' THEN COALESCE(p.price_yearly,0)/12.0
             ELSE COALESCE(p.price_monthly,0) END
      END
    ), 0)::numeric                                        AS new_mrr
  FROM public.lit_user_activation ua
  LEFT JOIN public.plans p ON p.code = ua.current_plan
  WHERE public.is_platform_admin(auth.uid())
  GROUP BY COALESCE(ua.signup_source, 'direct/unknown')
  ORDER BY signups DESC;
$fn$;

COMMENT ON FUNCTION public.lit_admin_acquisition_funnel() IS
  'Platform-admin-gated first-touch acquisition funnel: source -> signups/searched/saved/trial/converted + new_mrr. Source is utm_source when present, else ''direct/unknown'' (currently ALL rows, since attribution carries no utm keys yet). new_mrr joins plans.price_monthly/yearly by plan_code; enterprise price is NULL in plans so its MRR contributes 0 (data-quality caveat).';

REVOKE ALL ON FUNCTION public.lit_admin_acquisition_funnel() FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_acquisition_funnel() TO authenticated;

-- Convenience admin-gated view wrapping the function.
CREATE OR REPLACE VIEW public.lit_admin_acquisition_funnel_v
  WITH (security_invoker = true) AS
  SELECT * FROM public.lit_admin_acquisition_funnel();

COMMENT ON VIEW public.lit_admin_acquisition_funnel_v IS
  'Thin view over lit_admin_acquisition_funnel(); the function itself enforces is_platform_admin gating.';
