-- Lead-CRM Phase 3 — extend the unified timeline to fold in the new comms sources.
--
-- The existing lit_leadcrm_lead_timeline (20260816000500) already unions:
--   1) lit_lead_activity  (now carries email_sent / demo_invite_sent /
--      added_to_campaign / call_booking_opened / call_booked kinds written by
--      the Phase-3 RPCs + cal-webhook)
--   2) magnet events   3) usage ledger   4) activity events
--   5) resend opens/clicks   5b) email_webhook_events   6) demo invites
--
-- This replaces the function to ADD:
--   7) inbound + outbound thread MESSAGES (lit_email_messages) where the lead is
--      a thread participant — so the actual conversation shows in the timeline,
--      not just open/click pings. Degrades to nothing when no mailbox is synced
--      (honest: Gmail inbound is blocked pending CASA; Outlook works).
--   8) campaign SENDS from lit_outreach_history (event_type sent/opened/clicked/
--      replied) addressed to the lead's email — so "added to campaign" touches
--      become visible as real sends land.
--
-- Everything else is preserved verbatim from the Phase-1 definition.

create or replace function public.lit_leadcrm_lead_timeline(p_lead_id uuid)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare
  v_email  citext;
  v_user   uuid;
  v_anon   text;
  v_rows   jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select email, user_id, anonymous_id into v_email, v_user, v_anon
  from public.lit_admin_leads where id = p_lead_id;
  if v_email is null and v_user is null and v_anon is null then
    -- Lead exists but has no keys to join on yet — still return native activity.
    if not exists (select 1 from public.lit_admin_leads where id = p_lead_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
  end if;

  with unified as (
    -- 1) native lead activity (notes, touches, email_sent, demo_invite_sent,
    --    added_to_campaign, call_booking_opened, call_booked, assignment, …)
    select a.occurred_at, a.kind, coalesce(a.source,'system') as source,
           a.kind as title,
           a.body as detail
    from public.lit_lead_activity a
    where a.lead_id = p_lead_id

    -- 2) magnet events (by anonymous_id)
    union all
    select e.created_at, 'magnet_event', 'magnet',
           e.event_name,
           jsonb_build_object('magnet_slug', e.magnet_slug, 'metadata', e.metadata)
    from public.lit_lead_magnet_events e
    where v_anon is not null and e.anonymous_id = v_anon

    -- 3) product usage (searches/saves/enrich) via usage_ledger (by user_id)
    union all
    select ul.created_at, 'usage', 'product',
           ul.feature_key || coalesce(':'||ul.action_key,''),
           jsonb_build_object('feature', ul.feature_key, 'action', ul.action_key, 'qty', ul.quantity)
    from public.lit_usage_ledger ul
    where v_user is not null and ul.user_id = v_user

    -- 4) product activity events (by user_id)
    union all
    select ae.created_at, ae.event_type, 'product',
           ae.event_type,
           coalesce(ae.metadata, '{}'::jsonb)
    from public.lit_activity_events ae
    where v_user is not null and ae.user_id = v_user

    -- 5) email opens/clicks — resend events (by recipient email)
    union all
    select re.created_at, coalesce(re.event_type,'email'), 'email',
           coalesce(re.subject, re.event_type, 'email'),
           jsonb_build_object('event_type', re.event_type, 'click_url', re.click_url, 'template_id', re.template_id)
    from public.lit_resend_events re
    where v_email is not null and re.email_to is not null and lower(re.email_to) = v_email::text

    -- 5b) email webhook events (by recipient in to_emails jsonb array)
    union all
    select we.created_at_provider, coalesce(we.event_type,'email'), 'email',
           coalesce(we.subject, we.event_type, 'email'),
           jsonb_build_object('event_type', we.event_type, 'provider', we.provider)
    from public.email_webhook_events we
    where v_email is not null and we.to_emails is not null
      and exists (select 1 from jsonb_array_elements_text(we.to_emails) x where lower(x) = v_email::text)

    -- 6) demo invite lifecycle (by prospect email)
    union all
    select coalesce(di.sent_at, di.created_at), 'demo_sent', 'demo',
           'Demo invite sent',
           jsonb_build_object('status', di.status, 'company', di.prospect_company)
    from public.lit_demo_invites di
    where v_email is not null and lower(di.prospect_email) = v_email::text

    -- 7) inbound/outbound THREAD MESSAGES where the lead is a participant.
    --    (Gmail inbound blocked pending CASA; Outlook synced — degrades to none.)
    union all
    select m.message_date,
           case when m.direction = 'inbound' then 'email_received' else 'email_thread' end,
           'email',
           coalesce(m.subject, 'Email'),
           jsonb_build_object(
             'direction', m.direction,
             'from', coalesce(m.from_name, m.from_email),
             'snippet', left(coalesce(m.snippet, m.body_text, ''), 240)
           )
    from public.lit_email_messages m
    join public.lit_email_threads th on th.id = m.thread_id
    where v_email is not null
      and th.participants is not null
      and exists (
        select 1 from jsonb_array_elements(th.participants) p
        where lower(coalesce(p->>'email','')) = v_email::text
      )

    -- 8) campaign sends addressed to the lead (lit_outreach_history by recipient
    --    email in metadata). Shows enrolled-campaign sends + their open/click.
    union all
    select oh.occurred_at, coalesce(oh.event_type,'email'), 'email',
           coalesce(oh.subject, oh.event_type, 'Campaign email'),
           jsonb_build_object(
             'event_type', oh.event_type,
             'status', oh.status,
             'provider', oh.provider,
             'campaign_id', oh.campaign_id
           )
    from public.lit_outreach_history oh
    where v_email is not null
      and oh.channel = 'email'
      and lower(coalesce(oh.metadata->>'recipient_email','')) = v_email::text
  )
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select occurred_at, kind, source, title, detail
    from unified
    where occurred_at is not null
    order by occurred_at desc
    limit 200
  ) t;

  return jsonb_build_object('ok', true, 'timeline', v_rows);
end;
$$;

revoke all on function public.lit_leadcrm_lead_timeline(uuid) from public;
grant execute on function public.lit_leadcrm_lead_timeline(uuid) to authenticated;
