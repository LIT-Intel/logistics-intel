-- Pulse Explorer Phase 0 follow-up: UNIQUE constraint on (canonical_name, country, state).
-- Backs the V6 ingest's onConflict (scripts/ingest-v6-csv.ts).
--
-- Prerequisite for a fresh database: canonical_name must be populated.
-- For the existing production database this was handled via a one-time backfill
-- + dedup of 43 colliding Panjiva rows (kept the row with most non-null fields
-- per (canonical_name, country, state); tie-broken by updated_at desc, id asc).
-- Those one-time data ops are not replayable as a migration.

alter table lit_company_directory
  add constraint lit_company_directory_canonical_uniq
  unique (canonical_name, country, state);
