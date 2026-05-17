-- Unsubscribe-by-token RPC. SECURITY DEFINER so the marketing-app anon key
-- can call it without needing service-role credentials in Vercel. Token is
-- the 48-char hex unsubscribe_token from lit_user_alert_prefs.

BEGIN;

CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  UPDATE public.lit_user_alert_prefs
  SET volume_alerts = false,
      shipment_alerts = false,
      lane_alerts = false,
      benchmark_alerts = false,
      paused_until = '2099-01-01T00:00:00Z',
      updated_at = now()
  WHERE unsubscribe_token = p_token
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsubscribe_by_token(text) TO anon, authenticated;

COMMIT;
