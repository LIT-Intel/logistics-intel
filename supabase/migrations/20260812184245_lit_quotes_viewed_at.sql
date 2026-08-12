-- Live quote view tracking (digital quote-in-email overhaul, 2026-08-12).
--
-- The public live-quote page (/q/:token -> quote-view edge fn) stamps the
-- FIRST open of a shared quote here. This is a funnel signal: sent_at ->
-- viewed_at -> approved_at. The status flip sent->viewed already existed;
-- viewed_at makes the moment queryable even after later status transitions.
alter table public.lit_quotes
  add column if not exists viewed_at timestamptz;

comment on column public.lit_quotes.viewed_at is
  'First time the public share link (live quote page or PDF redirect) was opened by the recipient. Set once by the quote-view edge function.';
