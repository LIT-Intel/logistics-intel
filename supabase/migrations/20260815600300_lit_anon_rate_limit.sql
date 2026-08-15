-- Growth Sprint DATA foundation 4/8: anon rate-limit counter + atomic check fn.
-- Closes the anon-throttle gap: public lead-magnet edge fns call check_anon_rate_limit()
-- (service role) to throttle by anon session / email / ip within a fixed window.
CREATE TABLE IF NOT EXISTS public.lit_anon_rate_limit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text NOT NULL,            -- 'anon_session' | 'email' | 'ip'
  key           text NOT NULL,
  magnet_slug   text NOT NULL DEFAULT '',
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lit_anon_rate_limit_uniq UNIQUE (scope, key, magnet_slug, window_start)
);

COMMENT ON TABLE public.lit_anon_rate_limit IS
  'Fixed-window rate-limit counters for anonymous lead-magnet traffic. Mutated only through check_anon_rate_limit(). Service-role only (RLS on, no policies).';

ALTER TABLE public.lit_anon_rate_limit ENABLE ROW LEVEL SECURITY;
-- No policies: service role bypasses RLS; nobody else may read/write.

-- Atomic increment-and-check. Returns TRUE while under the limit for the current window.
-- Window is bucketed by floor(now()/p_window_secs) so concurrent calls converge on one row.
CREATE OR REPLACE FUNCTION public.check_anon_rate_limit(
  p_scope        text,
  p_key          text,
  p_magnet       text,
  p_limit        integer,
  p_window_secs  integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
  v_magnet       text := COALESCE(p_magnet, '');
BEGIN
  IF p_window_secs IS NULL OR p_window_secs <= 0 THEN
    p_window_secs := 60;
  END IF;
  -- Bucket the current instant to the start of its window.
  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_secs) * p_window_secs)
                      AT TIME ZONE 'UTC';

  INSERT INTO public.lit_anon_rate_limit (scope, key, magnet_slug, window_start, count, updated_at)
  VALUES (p_scope, p_key, v_magnet, v_window_start, 1, now())
  ON CONFLICT (scope, key, magnet_slug, window_start)
  DO UPDATE SET count = public.lit_anon_rate_limit.count + 1, updated_at = now()
  RETURNING count INTO v_count;

  RETURN v_count <= COALESCE(p_limit, 0);
END;
$fn$;

COMMENT ON FUNCTION public.check_anon_rate_limit(text, text, text, integer, integer) IS
  'Atomic fixed-window rate limiter for anonymous lead-magnet traffic. Increments the counter for (scope,key,magnet,window) and returns TRUE while count <= p_limit. Service-role only.';

REVOKE ALL ON FUNCTION public.check_anon_rate_limit(text, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.check_anon_rate_limit(text, text, text, integer, integer) TO service_role;
