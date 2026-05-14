-- Phase 3B — Admin aggregate RPCs + realtime publication.

CREATE OR REPLACE FUNCTION public.lit_admin_user_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_total int;
  v_active_7d int;
  v_active_30d int;
  v_new_today int;
  v_new_7d int;
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT count(*) INTO v_total FROM auth.users;
  SELECT count(*) INTO v_active_7d FROM auth.users WHERE last_sign_in_at >= now() - interval '7 days';
  SELECT count(*) INTO v_active_30d FROM auth.users WHERE last_sign_in_at >= now() - interval '30 days';
  SELECT count(*) INTO v_new_today FROM auth.users WHERE created_at >= date_trunc('day', now());
  SELECT count(*) INTO v_new_7d FROM auth.users WHERE created_at >= now() - interval '7 days';
  RETURN jsonb_build_object('total_users', v_total, 'active_7d', v_active_7d, 'active_30d', v_active_30d, 'new_today', v_new_today, 'new_7d', v_new_7d);
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_user_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION public.lit_admin_hourly_series(p_counter text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'not_admin'; END IF;
  WITH hours AS (
    SELECT generate_series(date_trunc('hour', now() - interval '23 hours'), date_trunc('hour', now()), interval '1 hour') AS hr
  )
  SELECT jsonb_agg(jsonb_build_object('hour', hr, 'count', cnt) ORDER BY hr) INTO v_result
  FROM (
    SELECT h.hr,
      CASE p_counter
        WHEN 'signups' THEN (SELECT count(*) FROM auth.users u WHERE date_trunc('hour', u.created_at) = h.hr)
        WHEN 'outreach_sent' THEN (SELECT count(*) FROM public.lit_outreach_history oh WHERE oh.status = 'sent' AND date_trunc('hour', oh.occurred_at) = h.hr)
        WHEN 'outreach_failed' THEN (SELECT count(*) FROM public.lit_outreach_history oh WHERE oh.status = 'failed' AND date_trunc('hour', oh.occurred_at) = h.hr)
        WHEN 'audit_events' THEN (SELECT count(*) FROM public.lit_audit_log al WHERE date_trunc('hour', al.created_at) = h.hr)
        WHEN 'campaigns_sending' THEN (SELECT count(*) FROM public.lit_campaign_contacts cc WHERE cc.status IN ('sent','queued') AND date_trunc('hour', cc.updated_at) = h.hr)
        ELSE 0
      END::int AS cnt
    FROM hours h
  ) buckets;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_hourly_series(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.lit_admin_system_health()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_stripe_age interval;
  v_gmail_connected int;
  v_outlook_connected int;
  v_apollo_age interval;
  v_clay_age interval;
  v_pulse_ai_age interval;
  v_importyeti_age interval;
  v_resend_age interval;
BEGIN
  IF NOT public.is_admin_caller() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT now() - max(created_at) INTO v_stripe_age FROM public.stripe_webhook_events;
  SELECT count(*) INTO v_gmail_connected FROM public.lit_email_accounts WHERE provider='gmail' AND status='connected';
  SELECT count(*) INTO v_outlook_connected FROM public.lit_email_accounts WHERE provider='outlook' AND status='connected';
  SELECT now() - max(created_at) INTO v_apollo_age FROM public.contact_enrichment_results WHERE provider='apollo';
  SELECT now() - max(created_at) INTO v_clay_age FROM public.contact_enrichment_results WHERE provider IN ('clay','lusha');
  SELECT now() - max(created_at) INTO v_pulse_ai_age FROM public.lit_pulse_ai_reports;
  SELECT now() - max(updated_at) INTO v_importyeti_age FROM public.lit_importyeti_company_snapshot;
  SELECT now() - max(occurred_at) INTO v_resend_age FROM public.lit_outreach_history WHERE provider='resend';
  RETURN jsonb_build_array(
    jsonb_build_object('svc','API · api.logisticintel.com','status','ok','note','live'),
    jsonb_build_object('svc','Supabase · Primary DB','status','ok','note','reads/writes healthy'),
    jsonb_build_object('svc','Supabase · Edge Functions','status','ok','note',''),
    jsonb_build_object('svc','Stripe · Billing Webhooks','status', CASE WHEN v_stripe_age IS NULL THEN 'stale' WHEN v_stripe_age < interval '7 days' THEN 'ok' ELSE 'warning' END, 'note', CASE WHEN v_stripe_age IS NULL THEN 'no webhooks received yet' ELSE 'last event ' || to_char(extract(epoch from v_stripe_age) / 3600, 'FM999990.0') || 'h ago' END),
    jsonb_build_object('svc','Gmail API · OAuth','status', CASE WHEN v_gmail_connected > 0 THEN 'ok' ELSE 'stale' END, 'note', v_gmail_connected || ' connected mailbox' || CASE WHEN v_gmail_connected = 1 THEN '' ELSE 'es' END),
    jsonb_build_object('svc','Outlook / Microsoft Graph','status', CASE WHEN v_outlook_connected > 0 THEN 'ok' ELSE 'stale' END, 'note', v_outlook_connected || ' connected mailbox' || CASE WHEN v_outlook_connected = 1 THEN '' ELSE 'es' END),
    jsonb_build_object('svc','Resend · Marketing send','status', CASE WHEN v_resend_age IS NULL THEN 'stale' WHEN v_resend_age < interval '7 days' THEN 'ok' ELSE 'warning' END, 'note', CASE WHEN v_resend_age IS NULL THEN 'no Resend sends yet' ELSE 'last send ' || to_char(extract(epoch from v_resend_age) / 3600, 'FM999990.0') || 'h ago' END),
    jsonb_build_object('svc','ImportYeti · Ingestion','status', CASE WHEN v_importyeti_age IS NULL THEN 'stale' WHEN v_importyeti_age < interval '24 hours' THEN 'ok' WHEN v_importyeti_age < interval '7 days' THEN 'warning' ELSE 'stale' END, 'note', CASE WHEN v_importyeti_age IS NULL THEN 'no snapshots' ELSE 'last ' || to_char(extract(epoch from v_importyeti_age) / 3600, 'FM999990.0') || 'h ago' END),
    jsonb_build_object('svc','Apollo · Enrichment','status', CASE WHEN v_apollo_age IS NULL THEN 'stale' WHEN v_apollo_age < interval '7 days' THEN 'ok' ELSE 'warning' END, 'note', CASE WHEN v_apollo_age IS NULL THEN 'no enrichments yet' ELSE 'last ' || to_char(extract(epoch from v_apollo_age) / 3600, 'FM999990.0') || 'h ago' END),
    jsonb_build_object('svc','Clay / Lusha · Enrichment','status', CASE WHEN v_clay_age IS NULL THEN 'stale' WHEN v_clay_age < interval '7 days' THEN 'ok' ELSE 'warning' END, 'note', CASE WHEN v_clay_age IS NULL THEN 'no enrichments yet' ELSE 'last ' || to_char(extract(epoch from v_clay_age) / 3600, 'FM999990.0') || 'h ago' END),
    jsonb_build_object('svc','OpenAI · Pulse insights','status', CASE WHEN v_pulse_ai_age IS NULL THEN 'stale' WHEN v_pulse_ai_age < interval '7 days' THEN 'ok' ELSE 'warning' END, 'note', CASE WHEN v_pulse_ai_age IS NULL THEN 'no Pulse runs yet' ELSE 'last ' || to_char(extract(epoch from v_pulse_ai_age) / 3600, 'FM999990.0') || 'h ago' END)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_system_health() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lit_audit_log') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lit_audit_log;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lit_job_errors') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lit_job_errors;
  END IF;
END $$;
