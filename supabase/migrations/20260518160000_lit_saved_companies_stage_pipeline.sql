-- Migrate existing stage values to the new 7-stage pipeline.
UPDATE public.lit_saved_companies SET stage =
  CASE
    WHEN stage IN ('prospect','active') THEN 'prospecting'
    WHEN stage = 'customer' THEN 'closed_won'
    WHEN stage = 'churned' THEN 'closed_lost'
    WHEN stage = 'lead' THEN 'lead'
    WHEN stage IS NULL THEN 'lead'
    ELSE 'lead'
  END;

-- Replace the default
ALTER TABLE public.lit_saved_companies
  ALTER COLUMN stage SET DEFAULT 'lead';

-- Add CHECK constraint enforcing the new pipeline
ALTER TABLE public.lit_saved_companies
  DROP CONSTRAINT IF EXISTS lit_saved_companies_stage_check;
ALTER TABLE public.lit_saved_companies
  ADD CONSTRAINT lit_saved_companies_stage_check
  CHECK (stage = ANY (ARRAY[
    'lead'::text,
    'prospecting'::text,
    'needs_analysis'::text,
    'quoting'::text,
    'contract_negotiation'::text,
    'closed_won'::text,
    'closed_lost'::text
  ]));

-- Add stage_updated_at column for auditability
ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz;

-- Trigger that bumps stage_updated_at on insert or stage-change.
CREATE OR REPLACE FUNCTION public.set_lit_saved_companies_stage_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_updated_at := NOW();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lit_saved_companies_stage_updated_at ON public.lit_saved_companies;
CREATE TRIGGER trg_lit_saved_companies_stage_updated_at
  BEFORE INSERT OR UPDATE ON public.lit_saved_companies
  FOR EACH ROW EXECUTE FUNCTION public.set_lit_saved_companies_stage_updated_at();

-- Backfill stage_updated_at for existing rows so we have a starting timestamp.
UPDATE public.lit_saved_companies
   SET stage_updated_at = COALESCE(updated_at, created_at, NOW())
 WHERE stage_updated_at IS NULL;

-- RPC: update_saved_company_stage(uuid, text)
-- SECURITY DEFINER; scopes by auth.uid() so a user cannot mutate another
-- user's CRM stage. Returns the new (company_id, stage, stage_updated_at).
CREATE OR REPLACE FUNCTION public.update_saved_company_stage(
  p_company_id uuid,
  p_stage text
)
RETURNS TABLE(company_id uuid, stage text, stage_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_stage NOT IN ('lead','prospecting','needs_analysis','quoting','contract_negotiation','closed_won','closed_lost') THEN
    RAISE EXCEPTION 'invalid_stage:%', p_stage USING ERRCODE = '22023';
  END IF;
  UPDATE public.lit_saved_companies AS lsc
     SET stage = p_stage
   WHERE lsc.company_id = p_company_id
     AND lsc.user_id = v_user_id
  RETURNING lsc.company_id, lsc.stage, lsc.stage_updated_at
       INTO company_id, stage, stage_updated_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'company_not_saved_by_user' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.update_saved_company_stage(uuid, text) TO authenticated;
