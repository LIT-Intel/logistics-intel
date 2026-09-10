-- 2026-09-11 Mexico-sprint cleanup: placeholder "Company" shells + Augusta key
-- Context: docs/agents/HANDOFF_2026-09-11_MEXICO_SPRINT.md (P0 empty-key bug, commit b1cebd92).
-- Before the fix, every keyless save collided into corrupt lit_companies shells
-- (source_company_key = 'company/', name 'Company'/'Unknown'). The code fix is live;
-- this SQL repairs the data. Run in the Supabase dashboard SQL editor
-- (project jkmrfiaefxwgbvftohrb).
--
-- NOTE: lit_saved_companies has NO company_name column — go through company_id.
-- The FK lit_saved_companies.company_id → lit_companies.id is ON DELETE CASCADE,
-- so step 2c is belt-and-braces before 2d.

-- ============================================================================
-- STEP 1 — VERIFY (run this block alone first; if all three return 0 problem
-- rows and Augusta's key is correct, the cleanup already ran — stop here)
-- ============================================================================

-- 1a. Placeholder shells remaining (expect 0 rows)
SELECT id, name, source_company_key, domain, source, created_at
FROM lit_companies
WHERE source_company_key = 'company/'
   OR (name IN ('Company', 'Unknown') AND (domain = 'company.com' OR domain IS NULL));

-- 1b. Augusta Sportswear (expect exactly one row with
--     source_company_key = 'company/augusta-sportswear')
SELECT id, name, source_company_key, domain, source, created_at
FROM lit_companies
WHERE name ILIKE '%augusta%';

-- 1c. Saved rows still pointing at shells (expect 0 rows)
SELECT sc.id, sc.user_id, sc.company_id, sc.stage, sc.created_at
FROM lit_saved_companies sc
JOIN lit_companies c ON c.id = sc.company_id
WHERE c.source_company_key = 'company/'
   OR (c.name IN ('Company', 'Unknown') AND (c.domain = 'company.com' OR c.domain IS NULL));

-- ============================================================================
-- STEP 2 — CLEANUP (only if STEP 1 showed problems)
-- ============================================================================

BEGIN;

-- 2a. Fix Augusta's canonical row key so the profile self-heal can attach a snapshot
UPDATE lit_companies
SET source_company_key = 'company/augusta-sportswear', updated_at = now()
WHERE name ILIKE 'augusta sportswear%'
  AND source_company_key IS DISTINCT FROM 'company/augusta-sportswear';

-- 2b. OPTIONAL — re-point saved rows that belong to Augusta but sit on a shell.
--     Only run for save rows you can positively attribute to Augusta (the shells
--     absorbed saves from MANY different companies — a blanket re-point would be
--     wrong). Unattributable shell saves are corrupt anyway (no snapshot ever
--     attached); deleting them in 2c and letting users re-save is the safe path.
-- UPDATE lit_saved_companies
-- SET company_id = (SELECT id FROM lit_companies
--                   WHERE source_company_key = 'company/augusta-sportswear'
--                   ORDER BY created_at LIMIT 1),
--     updated_at = now()
-- WHERE id IN ('<specific save row uuids>');

-- 2c. Delete saved rows pointing at shells
DELETE FROM lit_saved_companies
WHERE company_id IN (
  SELECT id FROM lit_companies
  WHERE source_company_key = 'company/'
     OR (name IN ('Company', 'Unknown') AND (domain = 'company.com' OR domain IS NULL))
);

-- 2d. Delete the shells themselves
DELETE FROM lit_companies
WHERE source_company_key = 'company/'
   OR (name IN ('Company', 'Unknown') AND (domain = 'company.com' OR domain IS NULL));

COMMIT;

-- ============================================================================
-- STEP 3 — re-run STEP 1: 1a and 1c must return 0 rows; 1b must show the
-- corrected key. Then in the app: open Augusta Sportswear's profile — it
-- should self-heal (live IY pull + snapshot poll) within ~20s.
-- ============================================================================
