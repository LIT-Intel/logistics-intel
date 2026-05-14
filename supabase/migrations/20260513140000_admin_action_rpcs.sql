-- Phase 3C — Admin write actions exposed as SECURITY DEFINER RPCs.
--
-- Each function checks is_admin_caller() before mutating, applies the
-- change, and audits the action to lit_audit_log via lit_audit_write().
-- Frontend calls supabase.rpc('lit_admin_*', { ... }) from inside the
-- ConfirmDialog flow.

CREATE OR REPLACE FUNCTION public.lit_admin_suspend_user(
  p_user uuid, p_suspend boolean
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid;
  v_email text;
BEGIN
  v_actor := auth.uid();
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user;
  UPDATE public.profiles
     SET status = CASE WHEN p_suspend THEN 'suspended' ELSE 'active' END,
         updated_at = now()
   WHERE id = p_user;
  PERFORM public.lit_audit_write(
    v_actor, 'admin',
    CASE WHEN p_suspend THEN 'admin.user.suspend' ELSE 'admin.user.reactivate' END,
    coalesce(v_email, p_user::text),
    'warn', 'admin',
    jsonb_build_object('user_id', p_user, 'suspend', p_suspend)
  );
  RETURN CASE WHEN p_suspend THEN 'suspended' ELSE 'active' END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_suspend_user(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.lit_admin_set_campaign_status(
  p_campaign uuid, p_status text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid;
  v_name text;
  v_action text;
BEGIN
  IF p_status NOT IN ('paused','active','completed','draft') THEN
    RAISE EXCEPTION 'invalid_status %', p_status;
  END IF;
  v_actor := auth.uid();
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT name INTO v_name FROM public.lit_campaigns WHERE id = p_campaign;
  UPDATE public.lit_campaigns
     SET status = p_status, updated_at = now()
   WHERE id = p_campaign;
  IF p_status IN ('paused','completed') THEN
    UPDATE public.lit_campaign_contacts
       SET status = 'paused', next_send_at = NULL, updated_at = now()
     WHERE campaign_id = p_campaign AND status IN ('pending','queued');
  END IF;
  v_action := 'admin.campaign.' || CASE
    WHEN p_status = 'paused' THEN 'pause'
    WHEN p_status = 'active' THEN 'resume'
    WHEN p_status = 'completed' THEN 'force_stop'
    ELSE 'set_status'
  END;
  PERFORM public.lit_audit_write(
    v_actor, 'admin', v_action,
    coalesce(v_name, p_campaign::text),
    CASE WHEN p_status = 'completed' THEN 'warn' ELSE 'info' END,
    'admin',
    jsonb_build_object('campaign_id', p_campaign, 'status', p_status)
  );
  RETURN p_status;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_set_campaign_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.lit_admin_resolve_job_error(
  p_error uuid
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid;
  v_recipient uuid;
  v_code text;
BEGIN
  v_actor := auth.uid();
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.lit_job_errors
     SET resolved = true, resolved_at = now(), resolved_by = v_actor
   WHERE id = p_error
   RETURNING recipient_id, code INTO v_recipient, v_code;
  IF v_recipient IS NOT NULL THEN
    UPDATE public.lit_campaign_contacts
       SET status = 'queued', next_send_at = now(), last_error = NULL, updated_at = now()
     WHERE id = v_recipient AND status IN ('failed','paused');
  END IF;
  PERFORM public.lit_audit_write(
    v_actor, 'admin', 'admin.job_error.retry',
    coalesce(v_code, p_error::text), 'info', 'admin',
    jsonb_build_object('error_id', p_error, 'recipient_id', v_recipient)
  );
  RETURN 'resolved';
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_resolve_job_error(uuid) TO authenticated;
