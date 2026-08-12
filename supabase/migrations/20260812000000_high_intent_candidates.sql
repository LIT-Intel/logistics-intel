-- Engagement branching (2026-08-12, applied to prod via MCP): detect
-- not-yet-signed-up recipients whose email behavior signals buying
-- intent — 2+ clicks or 4+ opens in 14 days — for the engagement-branch
-- cron's "high-intent-offer" sequence. Pricing-page clickers flagged.
-- Dormant until Resend open/click tracking populates lit_resend_events.

create or replace function public.lit_high_intent_candidates()
returns table (email text, clicks_14d bigint, opens_14d bigint, clicked_pricing boolean)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  with sig as (
    select
      lower(email_to) as email,
      count(*) filter (where event_type ilike '%click%') as clicks_14d,
      count(*) filter (where event_type ilike '%open%') as opens_14d,
      bool_or(event_type ilike '%click%' and coalesce(click_url,'') ilike '%pricing%') as clicked_pricing
    from public.lit_resend_events
    where created_at > now() - interval '14 days'
      and email_to is not null
    group by 1
  )
  select s.email, s.clicks_14d, s.opens_14d, s.clicked_pricing
  from sig s
  where (s.clicks_14d >= 2 or s.opens_14d >= 4)
    and not exists (select 1 from auth.users u where lower(u.email) = s.email)
    and not exists (select 1 from public.lit_email_unsubscribes un where lower(un.recipient_email) = s.email)
    and not exists (select 1 from public.lit_email_suppression_list sup where lower(sup.email) = s.email)
    and not exists (
      select 1 from public.lit_lead_sequence_queue q
      where lower(q.email) = s.email and q.sequence_key = 'high-intent-offer'
        and q.created_at > now() - interval '45 days'
    )
$$;

revoke execute on function public.lit_high_intent_candidates() from public, anon, authenticated;
grant execute on function public.lit_high_intent_candidates() to service_role;
