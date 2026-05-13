-- Phase 3D — admin override for custom-priced subscriptions.
-- plans.price_monthly is NULL for the enterprise tier. The subscription
-- row gains a metadata jsonb where an admin can store the real monthly
-- amount in cents (metadata.monthly_amount_cents). Revenue KPIs read
-- the override first, then plans.price_*, then enterpriseActive
-- separately. Writes go through lit_admin_set_subscription_amount so
-- every change lands in lit_audit_log.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.lit_admin_set_subscription_amount(
  p_subscription_id uuid,
  p_monthly_cents integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid;
  v_user uuid;
  v_old jsonb;
BEGIN
  v_actor := auth.uid();
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_monthly_cents IS NOT NULL AND p_monthly_cents < 0 THEN RAISE EXCEPTION 'negative_amount'; END IF;

  SELECT user_id, metadata INTO v_user, v_old FROM public.subscriptions WHERE id = p_subscription_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'sub_not_found'; END IF;

  UPDATE public.subscriptions
     SET metadata = jsonb_set(
           coalesce(metadata, '{}'::jsonb),
           '{monthly_amount_cents}',
           CASE WHEN p_monthly_cents IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_monthly_cents) END,
           true
         ),
         updated_at = now()
   WHERE id = p_subscription_id;

  PERFORM public.lit_audit_write(
    v_actor, 'admin', 'admin.subscription.set_amount',
    p_subscription_id::text, 'info', 'admin',
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'user_id', v_user,
      'monthly_cents', p_monthly_cents,
      'previous', v_old -> 'monthly_amount_cents'
    )
  );
  RETURN p_monthly_cents;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_set_subscription_amount(uuid, integer) TO authenticated;
