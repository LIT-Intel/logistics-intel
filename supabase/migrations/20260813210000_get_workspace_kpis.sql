-- get_workspace_kpis — org-wide dashboard KPI aggregation (CEO directive
-- 2026-08-13, "Evan bug"). The dashboard header says "Workspace overview"
-- but every KPI query was scoped to auth.uid(): an org member with zero
-- personal saves/campaigns/contacts (evan@logisticintel.com) saw an
-- all-zero dashboard even though his org has hundreds of saved accounts.
--
-- This RPC returns the four counts the frontend previously assembled from
-- three separate user-scoped calls (dashboard-contact-metrics edge fn +
-- two direct count queries):
--   contacts / verified_emails  — lit_contacts across the workspace-visible
--                                 saved-company set (own saves + org saves
--                                 when the org has saved_sharing_enabled,
--                                 mirroring lit_saved_companies RLS).
--   pulse_briefs_mtd            — lit_pulse_ai_reports this month, org-wide
--                                 (org_id match) plus the caller's own.
--   outreach_sent_mtd           — lit_outreach_history 'sent' rows this
--                                 month across active org members (the
--                                 table has no org_id column, so member-set
--                                 scoping is the org dimension).
--
-- SECURITY DEFINER with the org derived strictly from org_members for
-- auth.uid() — a caller can never widen scope beyond their own active
-- membership. Solo users (no active org row) get user-scoped counts,
-- identical to the previous behavior.

create or replace function public.get_workspace_kpis()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_sharing boolean := false;
  v_month timestamptz := date_trunc('month', now());
  v_contacts int := 0;
  v_verified int := 0;
  v_pulse int := 0;
  v_outreach int := 0;
begin
  if v_uid is null then
    raise exception 'get_workspace_kpis: not authenticated';
  end if;

  select om.org_id, coalesce(o.saved_sharing_enabled, false)
    into v_org, v_sharing
    from org_members om
    join organizations o on o.id = om.org_id
   where om.user_id = v_uid
     and om.status = 'active'
   order by om.joined_at asc
   limit 1;

  select count(*),
         count(*) filter (
           where nullif(btrim(c.email), '') is not null
             and (coalesce(c.verified_by_provider, false)
               or coalesce(c.email_verified, false))
         )
    into v_contacts, v_verified
    from lit_contacts c
   where c.company_id in (
     select distinct sc.company_id
       from lit_saved_companies sc
      where sc.user_id = v_uid
         or (v_sharing and v_org is not null and sc.org_id = v_org)
   );

  select count(*) into v_pulse
    from lit_pulse_ai_reports r
   where r.created_at >= v_month
     and (r.generated_by_user_id = v_uid
       or (v_org is not null and r.org_id = v_org));

  select count(*) into v_outreach
    from lit_outreach_history h
   where h.event_type = 'sent'
     and h.occurred_at >= v_month
     and (h.user_id = v_uid
       or (v_org is not null and h.user_id in (
         select om2.user_id from org_members om2
          where om2.org_id = v_org and om2.status = 'active')));

  return jsonb_build_object(
    'org_id', v_org,
    'contacts', v_contacts,
    'verified_emails', v_verified,
    'pulse_briefs_mtd', v_pulse,
    'outreach_sent_mtd', v_outreach
  );
end;
$$;

revoke all on function public.get_workspace_kpis() from public;
revoke all on function public.get_workspace_kpis() from anon;
grant execute on function public.get_workspace_kpis() to authenticated;
grant execute on function public.get_workspace_kpis() to service_role;
