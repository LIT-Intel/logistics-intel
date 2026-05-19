-- =============================================================================
-- lit_lead_scores — hot-lead scoring view + RPC
--
-- Computes a transparent weighted-sum score per lead from two first-party
-- event streams (events older than 30 days don't count, cap at 200):
--
--   public.lit_marketing_site_events
--     +1   page_view
--     +5   cta_click
--     +3   scroll_depth_75
--     +2   time_on_page_30s
--     +15  form_submit
--   public.lit_resend_events
--     +10  opened
--     +25  clicked
--
-- Hot lead threshold = 50 (admin dashboard surfaces hottest 20 by default).
-- Weights are intentionally tunable — operator can adjust by editing this
-- function in a follow-up migration; nothing reads them as a constant.
--
-- Read access: the view is owned by postgres and inherits the underlying
-- RLS posture of lit_leads / lit_marketing_site_events / lit_resend_events.
-- All three already gate SELECT to platform admins via is_admin_caller()
-- (lit_resend_events) or service_role only (lit_leads, lit_marketing_site_events).
-- The dashboard reads through the admin-API path via service-role so RLS
-- isn't the gating mechanism — page-level <RequireSuperAdmin> is.
-- =============================================================================

create or replace function public.lit_lead_score(p_email text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select event_name, count(*)::int as c
    from public.lit_marketing_site_events
    where lower(lead_email) = lower(p_email)
      and created_at > now() - interval '30 days'
    group by event_name
  ),
  r as (
    select event_type, count(*)::int as c
    from public.lit_resend_events
    where lower(email_to) = lower(p_email)
      and created_at > now() - interval '30 days'
    group by event_type
  )
  select least(200, coalesce((
    select sum(case event_name
      when 'page_view' then c * 1
      when 'cta_click' then c * 5
      when 'scroll_depth_75' then c * 3
      when 'time_on_page_30s' then c * 2
      when 'form_submit' then c * 15
      else 0
    end) from e
  ), 0) + coalesce((
    select sum(case event_type
      when 'opened' then c * 10
      when 'clicked' then c * 25
      else 0
    end) from r
  ), 0))::int;
$$;

comment on function public.lit_lead_score(text) is
  'Weighted-sum hot-lead score for an email over the last 30 days. Pulls site events from lit_marketing_site_events and email engagement from lit_resend_events. Returns 0-200.';

grant execute on function public.lit_lead_score(text) to authenticated, anon, service_role;

-- A view that joins lit_leads with computed scores, sorted hottest first.
-- The admin dashboard reads this directly. We don't materialize because
-- LIT volume (single-digit thousands of leads) makes the function call
-- cheap and freshness matters more than throughput.
create or replace view public.lit_lead_scores as
select
  l.id,
  l.email,
  l.source,
  l.offer,
  l.first_touch,
  l.created_at,
  public.lit_lead_score(l.email) as score
from public.lit_leads l;

comment on view public.lit_lead_scores is
  'Per-lead hot score (last 30d) joined with lit_leads identity. Ordered client-side by the consumer. Hot threshold = 50.';

-- Service-role gets full access (admin dashboard). Authenticated admins
-- inherit via the underlying lit_leads policy when one is added; today
-- the dashboard reads via service role from the admin API path.
grant select on public.lit_lead_scores to authenticated, service_role;
