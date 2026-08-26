-- Disk-IO remediation for lit_company_directory (2026-08-26)
--
-- The project was depleting its Supabase Disk-IO budget. pg_stat_statements
-- showed the top offenders were all against lit_company_directory (214 MB /
-- 78k rows) doing sequential scans + sorts:
--   1. company_name ILIKE $2 ORDER BY teu DESC   — 18,867 calls @ ~1,159 ms ea.
--      (company recognition / profile resolution) — 6+ hrs cumulative disk time.
--   2. is_active + seo_slug IS NOT NULL ORDER BY teu DESC (paginated)
--      — SEO sitemap / directory listing — seq-scan + full sort every call.
--
-- Fix = two pure index additions (no behavior change, results identical):
--   * gin_trgm_ops on company_name  -> ILIKE lookups become index scans
--     (measured 1,159 ms -> 1.06 ms, 0 disk reads).
--   * partial btree on teu DESC WHERE is_active AND seo_slug IS NOT NULL
--     -> the listing/sitemap queries stop seq-scanning + sorting
--     (measured 1,042 ms -> 0.49 ms).
--
-- NOTE: on production these were created with CREATE INDEX CONCURRENTLY (via
-- Supabase MCP execute_sql, outside a txn) to avoid locking. This file uses
-- plain CREATE INDEX IF NOT EXISTS so it stays transaction-safe for CI/fresh
-- environments; it is a no-op where the indexes already exist.

create extension if not exists pg_trgm;

create index if not exists idx_lcd_company_name_trgm
  on public.lit_company_directory using gin (company_name gin_trgm_ops);

create index if not exists idx_lcd_active_slug_teu
  on public.lit_company_directory (teu desc nulls last)
  where is_active = true and seo_slug is not null;
