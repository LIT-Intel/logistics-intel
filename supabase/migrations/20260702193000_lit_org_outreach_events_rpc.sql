create or replace function public.lit_org_outreach_events(
  p_org_id uuid,
  p_start_at timestamp with time zone default null,
  p_limit integer default 5000
)
returns table (
  id uuid,
  campaign_id uuid,
  campaign_step_id uuid,
  user_id uuid,
  event_type text,
  status text,
  occurred_at timestamp with time zone,
  subject text,
  metadata jsonb,
  error_message text
)
language sql
stable
security definer
set search_path = public
as $$
  with authorized as (
    select
      public.is_admin_caller()
      or exists (
        select 1
        from public.org_members om
        where om.org_id = p_org_id
          and om.user_id = auth.uid()
          and coalesce(om.status, 'active') = 'active'
      ) as ok
  ),
  org_users as (
    select om.user_id
    from public.org_members om
    where om.org_id = p_org_id
      and coalesce(om.status, 'active') = 'active'
  )
  select
    h.id,
    h.campaign_id,
    h.campaign_step_id,
    h.user_id,
    h.event_type,
    h.status,
    coalesce(h.occurred_at, h.created_at) as occurred_at,
    h.subject,
    h.metadata,
    h.error_message
  from public.lit_outreach_history h
  left join public.lit_campaigns c on c.id = h.campaign_id
  where (select ok from authorized)
    and (
      c.org_id = p_org_id
      or (
        h.campaign_id is null
        and h.user_id in (select user_id from org_users)
      )
      or (
        c.id is null
        and h.user_id in (select user_id from org_users)
      )
    )
    and (
      p_start_at is null
      or coalesce(h.occurred_at, h.created_at) >= p_start_at
    )
  order by coalesce(h.occurred_at, h.created_at) desc
  limit least(greatest(coalesce(p_limit, 5000), 1), 10000);
$$;

grant execute on function public.lit_org_outreach_events(uuid, timestamp with time zone, integer) to authenticated;
