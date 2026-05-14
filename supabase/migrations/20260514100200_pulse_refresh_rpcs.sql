BEGIN;

CREATE OR REPLACE FUNCTION public.try_pulse_refresh_lock(p_key int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN pg_try_advisory_lock(p_key);
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_pulse_refresh_lock(int) TO service_role;

CREATE OR REPLACE FUNCTION public.increment_consecutive_refresh_failures(p_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lit_saved_companies
  SET consecutive_refresh_failures = consecutive_refresh_failures + 1
  WHERE source_company_key = p_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_consecutive_refresh_failures(text) TO service_role;

COMMIT;
