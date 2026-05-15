BEGIN;
CREATE OR REPLACE FUNCTION public.try_pulse_advisory_lock(p_key bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN pg_try_advisory_lock(p_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pulse_advisory_lock(p_key bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM pg_advisory_unlock(p_key);
END;
$$;

REVOKE ALL ON FUNCTION public.try_pulse_advisory_lock(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_pulse_advisory_lock(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_pulse_advisory_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pulse_advisory_lock(bigint) TO service_role;
COMMIT;
