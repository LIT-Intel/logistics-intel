-- Expose the credit cost matrix to authenticated users (read-only catalog) so
-- the "How LIT Credits are used" helper can render it. Same grant+RLS pattern as
-- lit_credit_packages (RLS policy alone is not enough without the base GRANT).
alter table public.lit_credit_feature_costs enable row level security;
drop policy if exists lit_credit_feature_costs_read on public.lit_credit_feature_costs;
create policy lit_credit_feature_costs_read on public.lit_credit_feature_costs
  for select to authenticated using (true);
grant select on public.lit_credit_feature_costs to authenticated;
