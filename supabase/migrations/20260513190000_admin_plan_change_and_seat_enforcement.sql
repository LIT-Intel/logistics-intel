-- Phase 3 follow-up — super-org-admin plan changes + seat-limit enforcement.

CREATE OR REPLACE FUNCTION public.lit_admin_change_user_plan(
  p_user_id uuid,
  p_plan_code text,
  p_billing_interval text DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_actor uuid;
  v_plan public.plans;
  v_prev_plan text;
  v_email text;
BEGIN
  v_actor := auth.uid();
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'not_admin'; END IF;

  SELECT * INTO v_plan FROM public.plans WHERE code = p_plan_code AND is_active = true;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'plan_not_found %', p_plan_code; END IF;

  SELECT plan_code INTO v_prev_plan FROM public.subscriptions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1;
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  INSERT INTO public.subscriptions
    (user_id, plan_code, plan_id, status, billing_interval, started_at, current_period_start, updated_at)
  VALUES
    (p_user_id, p_plan_code, v_plan.id,
     CASE WHEN p_plan_code = 'free_trial' THEN 'trialing' ELSE 'active' END,
     COALESCE(p_billing_interval, 'month'),
     now(), now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET plan_code = EXCLUDED.plan_code,
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        billing_interval = COALESCE(EXCLUDED.billing_interval, public.subscriptions.billing_interval),
        updated_at = now();

  PERFORM public.lit_audit_write(
    v_actor, 'admin', 'admin.subscription.change_plan',
    coalesce(v_email, p_user_id::text), 'warn', 'admin',
    jsonb_build_object('user_id', p_user_id, 'from_plan', v_prev_plan, 'to_plan', p_plan_code, 'billing_interval', p_billing_interval, 'reason', p_reason)
  );
  RETURN jsonb_build_object('user_id', p_user_id, 'plan_code', p_plan_code, 'from_plan', v_prev_plan);
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_change_user_plan(uuid, text, text, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'u' AND conname = 'subscriptions_user_id_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='subscriptions' AND indexdef LIKE '%UNIQUE%user_id%'
  ) THEN
    BEGIN
      ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_org_seat_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_org uuid;
  v_plan_code text;
  v_included_seats int;
  v_member_count int;
  v_pending_invite_count int;
BEGIN
  v_org := NEW.org_id;
  IF v_org IS NULL THEN RETURN NEW; END IF;

  SELECT s.plan_code INTO v_plan_code
    FROM public.org_members om
    JOIN public.subscriptions s ON s.user_id = om.user_id
   WHERE om.org_id = v_org AND om.role = 'owner'
     AND s.status IN ('active', 'trialing')
   ORDER BY s.updated_at DESC NULLS LAST
   LIMIT 1;
  IF v_plan_code IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(included_seats, seat_limit, 1) INTO v_included_seats
    FROM public.plans WHERE code = v_plan_code;
  IF v_included_seats IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_member_count FROM public.org_members WHERE org_id = v_org;
  SELECT count(*) INTO v_pending_invite_count FROM public.org_invites WHERE org_id = v_org AND status IN ('pending','sent');

  IF (v_member_count + v_pending_invite_count) >= v_included_seats AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'seat_limit_exceeded: plan % allows % seats; org already has % member(s) + % pending invite(s). Upgrade the plan to add more.',
      v_plan_code, v_included_seats, v_member_count, v_pending_invite_count;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_members_seat_limit ON public.org_members;
CREATE TRIGGER trg_org_members_seat_limit BEFORE INSERT ON public.org_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_org_seat_limit();

DROP TRIGGER IF EXISTS trg_org_invites_seat_limit ON public.org_invites;
CREATE TRIGGER trg_org_invites_seat_limit BEFORE INSERT ON public.org_invites
FOR EACH ROW EXECUTE FUNCTION public.enforce_org_seat_limit();
