-- =============================================================================
-- lit_leads — first/last touch attribution columns
--
-- The marketing site captures utm + referrer + click-ids on landing into
-- first-party cookies (lit_first_touch / lit_last_touch). On lead-magnet
-- submit, the API receives BOTH snapshots so we can reason about the full
-- attribution path, not just the URL the visitor happened to be on at
-- submit time.
--
-- Schema:
--   first_touch  jsonb  — the earliest tagged landing in the 90-day window
--                         (utm_*, gclid, fbclid, li_fat_id, referrer,
--                         landing_page, captured_at). Never overwritten
--                         client-side once set, so this is the original
--                         channel.
--   last_touch   jsonb  — the most recent tagged landing. Useful for
--                         multi-touch reports and channel decay analysis.
--
-- Both are nullable — historic rows have no attribution and we don't
-- want to fail the insert path if the client sent nothing.
--
-- GIN indexes are intentionally NOT added — query volume is low and the
-- column is small. We can add them later if reporting queries pile up.
-- =============================================================================

alter table public.lit_leads
  add column if not exists first_touch jsonb,
  add column if not exists last_touch  jsonb;

comment on column public.lit_leads.first_touch is
  'First-touch attribution snapshot (utm_*, gclid, fbclid, li_fat_id, referrer, landing_page, captured_at). Captured client-side into lit_first_touch cookie on the earliest tagged landing in the 90-day window.';

comment on column public.lit_leads.last_touch is
  'Last-touch attribution snapshot. Overwritten client-side each time the visitor lands on a URL with at least one utm/click-id.';
