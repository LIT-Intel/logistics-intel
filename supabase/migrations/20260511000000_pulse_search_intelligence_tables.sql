-- Pulse search intelligence — telemetry, Apollo daily-usage caps,
-- and Pulse Coach FAQ knowledge base.
--
-- Applied to production 2026-05-11 via Supabase MCP. This file exists
-- for local re-application and source-of-truth tracking.

-- 1. Pulse search telemetry — every query logged for quality tuning.
CREATE TABLE IF NOT EXISTS public.lit_pulse_search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id uuid,
  raw_query text NOT NULL,
  parsed_intent jsonb,
  source_counts jsonb,
  result_count integer NOT NULL DEFAULT 0,
  zero_result boolean NOT NULL DEFAULT false,
  apollo_called boolean NOT NULL DEFAULT false,
  parser_model text,
  first_result_ms integer,
  total_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lit_pulse_search_events_user_created_idx
  ON public.lit_pulse_search_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lit_pulse_search_events_zero_result_idx
  ON public.lit_pulse_search_events (zero_result, created_at DESC)
  WHERE zero_result = true;
ALTER TABLE public.lit_pulse_search_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE policyname = 'lit_pulse_search_events_service_all'
    AND tablename = 'lit_pulse_search_events';
  IF NOT FOUND THEN
    CREATE POLICY lit_pulse_search_events_service_all ON public.lit_pulse_search_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Apollo daily usage — per-user counter to enforce subscription-tier caps.
CREATE TABLE IF NOT EXISTS public.lit_apollo_daily_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  apollo_company_searches integer NOT NULL DEFAULT 0,
  apollo_contact_searches integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, usage_date)
);
CREATE INDEX IF NOT EXISTS lit_apollo_daily_usage_user_date_idx
  ON public.lit_apollo_daily_usage (user_id, usage_date DESC);
ALTER TABLE public.lit_apollo_daily_usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE policyname = 'lit_apollo_daily_usage_service_all'
    AND tablename = 'lit_apollo_daily_usage';
  IF NOT FOUND THEN
    CREATE POLICY lit_apollo_daily_usage_service_all ON public.lit_apollo_daily_usage
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  PERFORM 1 FROM pg_policies WHERE policyname = 'lit_apollo_daily_usage_self_read'
    AND tablename = 'lit_apollo_daily_usage';
  IF NOT FOUND THEN
    CREATE POLICY lit_apollo_daily_usage_self_read ON public.lit_apollo_daily_usage
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Help articles — Pulse Coach FAQ knowledge base.
CREATE TABLE IF NOT EXISTS public.lit_help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  route_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lit_help_articles_category_idx
  ON public.lit_help_articles (category, sort_order)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS lit_help_articles_keywords_gin_idx
  ON public.lit_help_articles USING GIN (keywords);
ALTER TABLE public.lit_help_articles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  PERFORM 1 FROM pg_policies WHERE policyname = 'lit_help_articles_service_all'
    AND tablename = 'lit_help_articles';
  IF NOT FOUND THEN
    CREATE POLICY lit_help_articles_service_all ON public.lit_help_articles
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  PERFORM 1 FROM pg_policies WHERE policyname = 'lit_help_articles_authenticated_read'
    AND tablename = 'lit_help_articles';
  IF NOT FOUND THEN
    CREATE POLICY lit_help_articles_authenticated_read ON public.lit_help_articles
      FOR SELECT TO authenticated USING (is_active = true);
  END IF;
END $$;

-- 4. Apollo usage helper — atomic increment with daily-roll-over.
CREATE OR REPLACE FUNCTION public.increment_apollo_usage(
  p_user_id uuid,
  p_kind text DEFAULT 'company',
  p_delta integer DEFAULT 1
)
RETURNS TABLE (
  apollo_company_searches integer,
  apollo_contact_searches integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lit_apollo_daily_usage (user_id, usage_date, apollo_company_searches, apollo_contact_searches)
  VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN p_kind = 'company' THEN p_delta ELSE 0 END,
    CASE WHEN p_kind = 'contact' THEN p_delta ELSE 0 END
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET apollo_company_searches = lit_apollo_daily_usage.apollo_company_searches +
          CASE WHEN p_kind = 'company' THEN p_delta ELSE 0 END,
        apollo_contact_searches = lit_apollo_daily_usage.apollo_contact_searches +
          CASE WHEN p_kind = 'contact' THEN p_delta ELSE 0 END,
        updated_at = now();

  RETURN QUERY
    SELECT u.apollo_company_searches, u.apollo_contact_searches
    FROM public.lit_apollo_daily_usage u
    WHERE u.user_id = p_user_id AND u.usage_date = CURRENT_DATE
    LIMIT 1;
END;
$$;
