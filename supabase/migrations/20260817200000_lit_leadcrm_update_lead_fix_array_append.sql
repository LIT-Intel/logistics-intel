-- Repair lit_leadcrm_update_lead from 20260817100000.
--
-- The original function appended scalar labels with:
--   v_changed := v_changed || 'title'
-- PostgreSQL resolved the untyped literal as an array literal and raised 22P02
-- before the UPDATE ran. Rebuild the existing function definition with
-- unambiguous array_append(text[], text) calls. Keeping the rest of the
-- deployed function definition intact prevents drift between this corrective
-- migration and the original PATCH semantics.
DO $migration$
DECLARE
  v_oid oid;
  v_definition text;
  v_fixed text;
BEGIN
  SELECT p.oid
    INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'lit_leadcrm_update_lead'
    AND p.pronargs = 12;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'public.lit_leadcrm_update_lead with 12 arguments was not found';
  END IF;

  SELECT pg_get_functiondef(v_oid) INTO v_definition;

  v_fixed := regexp_replace(
    v_definition,
    $pattern$v_changed := v_changed \|\| '([^']+)'$pattern$,
    $replacement$v_changed := array_append(v_changed, '\1'::text)$replacement$,
    'g'
  );

  IF v_fixed = v_definition THEN
    -- Idempotent when the live function has already received Claude's fix.
    IF position('array_append(v_changed' IN v_definition) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Expected v_changed array append expressions were not found';
  END IF;

  EXECUTE v_fixed;
END
$migration$;
