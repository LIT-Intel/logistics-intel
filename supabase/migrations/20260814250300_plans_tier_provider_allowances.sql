-- Phase 2A (data-economics): advisory tier-allowance columns on plans. NULLABLE, infra-only.
-- NOT enforced yet (Phase 2B wires enforcement). NULL = unlimited by convention.
alter table public.plans
  add column if not exists monthly_provider_credit_allowance integer,
  add column if not exists manual_refresh_limit              integer,
  add column if not exists auto_refresh_frequency            text,
  add column if not exists max_monitored_companies           integer,
  add column if not exists history_depth                     integer;

comment on column public.plans.monthly_provider_credit_allowance is 'ADVISORY (Phase 2A, not enforced): provider credits/month per org. NULL=unlimited.';
comment on column public.plans.manual_refresh_limit is 'ADVISORY: user-triggered refreshes/month. NULL=unlimited.';
comment on column public.plans.auto_refresh_frequency is 'ADVISORY: background refresh cadence (none/weekly/daily). NULL=unset.';
comment on column public.plans.max_monitored_companies is 'ADVISORY: max companies under auto background refresh. NULL=unlimited.';
comment on column public.plans.history_depth is 'ADVISORY: months of shipment history exposed. NULL=unlimited.';

-- Advisory per-tier defaults (values are guidance only until Phase 2B enforces).
update public.plans set
  monthly_provider_credit_allowance = 50,
  manual_refresh_limit              = 5,
  auto_refresh_frequency            = 'none',
  max_monitored_companies           = 3,
  history_depth                     = 3
where code = 'free_trial';

update public.plans set
  monthly_provider_credit_allowance = 500,
  manual_refresh_limit              = 25,
  auto_refresh_frequency            = 'weekly',
  max_monitored_companies           = 25,
  history_depth                     = 12
where code = 'starter';

update public.plans set
  monthly_provider_credit_allowance = 2000,
  manual_refresh_limit              = 100,
  auto_refresh_frequency            = 'weekly',
  max_monitored_companies           = 100,
  history_depth                     = 24
where code = 'growth';

update public.plans set
  monthly_provider_credit_allowance = 6000,
  manual_refresh_limit              = 300,
  auto_refresh_frequency            = 'daily',
  max_monitored_companies           = 300,
  history_depth                     = 36
where code = 'scale';

-- enterprise: NULL everywhere = unlimited/advisory
update public.plans set
  monthly_provider_credit_allowance = null,
  manual_refresh_limit              = null,
  auto_refresh_frequency            = 'daily',
  max_monitored_companies           = null,
  history_depth                     = null
where code = 'enterprise';
