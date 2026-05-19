-- =============================================================================
-- lit_template_variants — A/B testing for drip-sequence templates
--
-- Per parent template (identified by the sequence-step env-var name, e.g.
-- "RESEND_TPL_TRIAL_WELCOME"), allow 1-N variants. Each variant points at
-- a separate Resend-dashboard template id. The cron dispatcher does a
-- weighted random pick at send time via public.lit_pick_variant().
--
-- Operator workflow:
--   1. Clone the production template in Resend → get new template id.
--   2. Insert a row here:   parent_template_env_var = 'RESEND_TPL_TRIAL_WELCOME',
--                            resend_template_id     = 're_tpl_abc123',
--                            label                  = 'b',
--                            weight                 = 50,
--                            active                 = true
--   3. Optionally also insert a row for the control with label='a',
--      weight=50, resend_template_id = <production id>. If no control
--      row exists, sends will only fire when a variant is picked AND the
--      pick succeeds — the env-var fallback handles the no-variants case
--      transparently (see cron dispatcher).
--
-- Weights don't need to sum to 100 — lit_pick_variant() normalizes at
-- query time. (weight=50 + weight=50 == weight=1 + weight=1; both are
-- 50/50.) This makes "give variant B 10% of traffic" easy: weight=10
-- on B, weight=90 on A.
-- =============================================================================

create table if not exists public.lit_template_variants (
  id uuid primary key default gen_random_uuid(),
  parent_template_env_var text not null,
  resend_template_id text not null,
  label text not null,
  weight int not null default 50,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (parent_template_env_var, label),
  check (weight >= 0 and weight <= 1000)
);

comment on table public.lit_template_variants is
  'A/B template variants for drip-sequence sends. Cron picks weighted-random via lit_pick_variant() at dispatch time. Falls back to env-var template when no active variants exist for the parent.';

create index if not exists idx_lit_template_variants_parent
  on public.lit_template_variants (parent_template_env_var)
  where active = true and weight > 0;

alter table public.lit_template_variants enable row level security;

drop policy if exists "service role manages variants" on public.lit_template_variants;
create policy "service role manages variants"
  on public.lit_template_variants
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "admins read variants" on public.lit_template_variants;
create policy "admins read variants"
  on public.lit_template_variants
  for select
  to authenticated
  using (public.is_admin_caller());

-- Add the variant-tracking column to the queue so per-variant performance
-- can be rolled up after-the-fact. Nullable because:
--   1. Existing rows have no variant attribution.
--   2. Sends that fall back to env-var (no active variants) stay null.
alter table public.lit_lead_sequence_queue
  add column if not exists template_variant_id uuid
  references public.lit_template_variants(id) on delete set null;

create index if not exists idx_lit_lead_sequence_queue_variant
  on public.lit_lead_sequence_queue (template_variant_id)
  where template_variant_id is not null;

-- Weighted random pick. Returns the chosen variant id + resend template
-- id, or zero rows when no active variants are configured for the parent
-- (so the caller falls through to its env-var-based default behavior).
--
-- The pick uses cumulative weight: random() * total_weight gives a point
-- inside [0, total). We walk the rows in creation order and return the
-- first whose running sum crosses the point. This is uniform-by-weight
-- and stable enough for an A/B test without needing a CTE per call.
create or replace function public.lit_pick_variant(p_parent_env_var text)
returns table(variant_id uuid, template_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  total_weight int;
  pick numeric;
  running int := 0;
  v record;
begin
  select coalesce(sum(weight), 0) into total_weight
  from public.lit_template_variants
  where parent_template_env_var = p_parent_env_var
    and active = true
    and weight > 0;

  if total_weight is null or total_weight = 0 then
    return;
  end if;

  pick := random() * total_weight;

  for v in
    select id, resend_template_id, weight
    from public.lit_template_variants
    where parent_template_env_var = p_parent_env_var
      and active = true
      and weight > 0
    order by created_at, id
  loop
    running := running + v.weight;
    if pick < running then
      variant_id := v.id;
      template_id := v.resend_template_id;
      return next;
      return;
    end if;
  end loop;
end;
$$;

comment on function public.lit_pick_variant(text) is
  'Weighted-random A/B variant pick for the drip-sequence cron. Returns zero rows when no active variants exist (caller should fall back to env-var template).';

grant execute on function public.lit_pick_variant(text) to anon, authenticated, service_role;
