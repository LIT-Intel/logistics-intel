-- 20260814245000_lit_quotes_deal_link.sql
--
-- Quote ↔ Deal linkage (flow-audit GAP fix).
--
-- Before this migration a quote's won-value and a deal's value_amount were two
-- independent truths, so workspace revenue could double-count the same
-- opportunity. This adds a nullable FK from a quote to the deal it belongs to
-- so the DEAL becomes the single source of truth for pipeline/revenue value and
-- quotes roll UP into it (see frontend/src/api/quoteDeal.ts + DealDetailDrawer).
--
-- Nullable + ON DELETE SET NULL: linking a quote to a deal is optional, and
-- deleting a deal must not delete its quotes — the quotes simply become
-- unlinked again. No change to lit_quotes' existing RLS: the four
-- lit_quotes_{select,insert,update,delete} policies are org/created_by scoped
-- and unaffected by a new column. Both sides are already org-scoped, so a stray
-- cross-org link can't be read anyway; we still add a same-org integrity guard.

alter table public.lit_quotes
  add column if not exists deal_id uuid
  references public.lit_deals(id) on delete set null;

comment on column public.lit_quotes.deal_id is
  'Optional link to the lit_deals row this quote belongs to. The deal is the '
  'single source of truth for pipeline value; linked quotes roll up into it. '
  'ON DELETE SET NULL — deleting a deal unlinks its quotes, never deletes them.';

-- Index for the deal-scoped lookup (lit_quotes where deal_id = $1) used by the
-- Deal Detail drawer's Quotes section, and partial so it stays tiny (most
-- quotes are unlinked).
create index if not exists lit_quotes_deal_id_idx
  on public.lit_quotes (deal_id)
  where deal_id is not null;
