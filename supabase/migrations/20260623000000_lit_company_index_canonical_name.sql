-- 20260623000000_lit_company_index_canonical_name.sql
--
-- Adds a normalized `canonical_name` column to lit_company_index so the
-- Pulse Explorer (pulse-explore edge fn) can dedup index-sourced IY companies
-- against lit_company_directory / lit_companies using the SAME canonical key
-- the rest of the system uses (_shared/canonical_name.ts canonicalizeName()).
--
-- Why this is needed:
--   lit_company_index is the free cache of ImportYeti search hits (written
--   25/search by importyeti-proxy, ZERO extra IY credits). It previously had
--   no canonical_name, so the Explorer could not surface those companies
--   without re-deriving the key at read time on every row. A real, generated
--   column lets us push the work into Postgres and (optionally) index it.
--
-- NON-DESTRUCTIVE: pure additive column. No existing rows are modified beyond
-- the generated value being computed. No data is moved between tables.
--
-- The expression mirrors canonicalizeName() exactly:
--   lower → strip trailing legal suffix → strip . , ' " ! ? ( ) → collapse
--   whitespace → trim.
-- Postgres regex notes:
--   * suffix regex is anchored at end ($) and case-insensitive (we lower()
--     first so a plain match suffices).
--   * the punctuation class strips the same chars as the JS [.,'"!?()].

-- 1. Add the generated column. STORED so PostgREST can select/filter it
--    cheaply and so a btree index can be built on it.
ALTER TABLE public.lit_company_index
  ADD COLUMN IF NOT EXISTS canonical_name text
  GENERATED ALWAYS AS (
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(coalesce(company_name, '')),
            '\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|sas|gmbh)$',
            '',
            'i'
          ),
          '[.,''"!?()]',
          '',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    )
  ) STORED;

-- 2. Index it for the Explorer's canonical-name dedup / lookups.
CREATE INDEX IF NOT EXISTS idx_lit_company_index_canonical_name
  ON public.lit_company_index (canonical_name);
