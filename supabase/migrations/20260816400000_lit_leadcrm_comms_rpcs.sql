-- Lead-CRM Phase 3 — COMMUNICATION & NURTURE layer.
--
-- Backend RPCs + config for the in-drawer Communication area. Every RPC is
-- SECURITY DEFINER and gated on public.is_lead_crm_member(auth.uid()) — the
-- same server-authoritative membership gate the rest of the Lead-CRM uses.
--
-- What this migration adds (all REUSE existing LIT comms systems):
--   1. lit_leadcrm_lead_email(p_lead_id)            → the lead's email + a
--      suppression flag (reuses lit_email_suppression_status), so the drawer
--      can enable/disable the composer honestly.
--   2. lit_leadcrm_log_email_sent(...)              → append an 'email_sent'
--      row to lit_lead_activity after the edge fn sends (the send path lives in
--      the lead-crm-send-email edge fn; this is the timeline write it calls).
--   3. lit_leadcrm_lead_threads(p_lead_id)          → inbox threads whose
--      participants (lit_email_threads.participants jsonb) include the lead's
--      email — mirrors CompanyInboxTab's read, degrades honestly when empty.
--   4. lit_leadcrm_log_demo_invite(p_lead_id)       → 'demo_invite_sent' row
--      (the actual send stays in send-demo-invite; this logs to the lead).
--   5. lit_leadcrm_list_campaigns() /
--      lit_leadcrm_add_to_campaign(...)             → enroll the lead's email
--      into an existing campaign via lit_campaign_contacts (the same roster the
--      send-campaign-email dispatcher walks), logging 'added_to_campaign'.
--   6. lit_leadcrm_cal_config() / lit_admin_set_cal_url(p_url) +
--      lit_leadcrm_log_call_booking_opened(p_lead_id) → Cal.com booking URL
--      stored in lit_internal_meta (key 'cal_booking_url'), read by the drawer,
--      settable by a platform admin; 'call_booking_opened' logged when clicked.
--
-- The unified timeline (lit_leadcrm_lead_timeline) already unions lit_lead_activity,
-- resend/webhook opens+clicks, inbound threads (via email events) and demo invites,
-- so every kind logged here surfaces chronologically with a source badge. We EXTEND
-- that timeline below (Part 7) to also fold in inbound thread messages + campaign
-- enrollment sends so the drawer shows the whole conversation.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lead email + suppression status (drives composer enable/disable)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.lit_leadcrm_lead_email(p_lead_id uuid)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare
  v_email    citext;
  v_name     text;
  v_supp     record;
  v_suppressed boolean := false;
  v_reason   text := null;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select email, full_name into v_email, v_name
  from public.lit_admin_leads where id = p_lead_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if v_email is not null then
    select * into v_supp from public.lit_email_suppression_status(v_email::text);
    if v_supp.unsubscribed then v_suppressed := true; v_reason := 'unsubscribed';
    elsif v_supp.bounced   then v_suppressed := true; v_reason := 'bounced';
    elsif v_supp.complained then v_suppressed := true; v_reason := 'complained';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', v_email::text,
    'full_name', v_name,
    'has_email', v_email is not null,
    'suppressed', v_suppressed,
    'suppressed_reason', v_reason
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Log an email send to the lead timeline (called by lead-crm-send-email edge fn)
--    Kept as an RPC so the log write is membership-gated + consistent with the
--    other lit_lead_activity writers. body carries subject + a preview.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.lit_leadcrm_log_email_sent(
  p_lead_id uuid,
  p_subject text,
  p_preview text default null,
  p_message_id text default null,
  p_provider text default 'resend'
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.lit_admin_leads where id = p_lead_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (
    p_lead_id, 'email_sent',
    jsonb_build_object(
      'subject', p_subject,
      'preview', left(coalesce(p_preview, ''), 240),
      'message_id', p_message_id,
      'provider', p_provider
    ),
    auth.uid(), 'email'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'activity_id', v_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Email threads for the lead — mirrors CompanyInboxTab's read, but matches on
--    the lead's email inside lit_email_threads.participants (jsonb array of
--    {email,name,role}) since a lead may have no company_id linked. Read-only.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.lit_leadcrm_lead_threads(p_lead_id uuid)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare
  v_email citext;
  v_rows  jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select email into v_email from public.lit_admin_leads where id = p_lead_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_email is null then
    return jsonb_build_object('ok', true, 'has_email', false, 'threads', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.last_message_at desc nulls last), '[]'::jsonb)
    into v_rows
  from (
    select
      th.id, th.subject, th.participants,
      th.last_message_at, th.message_count, th.unread_count,
      th.provider, th.status,
      -- last inbound/outbound snippet for the compact list
      (select m.snippet from public.lit_email_messages m
        where m.thread_id = th.id order by m.message_date desc nulls last limit 1) as last_snippet
    from public.lit_email_threads th
    where th.participants is not null
      and exists (
        select 1 from jsonb_array_elements(th.participants) p
        where lower(coalesce(p->>'email','')) = v_email::text
      )
    order by th.last_message_at desc nulls last
    limit 25
  ) t;

  return jsonb_build_object('ok', true, 'has_email', true, 'threads', v_rows);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Log a demo invite to the lead timeline (called after send-demo-invite).
--    The demo funnel row itself is written by send-demo-invite; the timeline
--    already surfaces lit_demo_invites by prospect email, but this adds an
--    explicit, member-attributed 'demo_invite_sent' touch too.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.lit_leadcrm_log_demo_invite(p_lead_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_id uuid; v_email citext;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  select email into v_email from public.lit_admin_leads where id = p_lead_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'demo_invite_sent',
          jsonb_build_object('email', v_email::text), auth.uid(), 'demo')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'activity_id', v_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Campaigns: list enrollable + enroll the lead's email.
--    Enrollment REUSES the lit_campaign_contacts roster the send-campaign-email
--    dispatcher walks: insert status='pending', current_step_id=null (so the
--    dispatcher starts at step 0), next_send_at=now(). Upsert on the existing
--    unique(campaign_id,email) so we never double-enroll.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.lit_leadcrm_list_campaigns()
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_rows jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  -- Campaigns the CRM team can enroll into: active/draft/paused in any org the
  -- caller belongs to (lead-CRM reps live in the internal org). Excludes archived.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status
    ) order by c.created_at desc), '[]'::jsonb)
    into v_rows
  from public.lit_campaigns c
  where c.status in ('active','draft','paused')
    and (
      c.org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid())
      or public.is_platform_admin(auth.uid())
    );

  return jsonb_build_object('ok', true, 'campaigns', v_rows);
end;
$$;

create or replace function public.lit_leadcrm_add_to_campaign(
  p_lead_id uuid, p_campaign_id uuid
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_email citext;
  v_name  text;
  v_first text;
  v_last  text;
  v_camp  record;
  v_existing text;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select email, full_name into v_email, v_name
  from public.lit_admin_leads where id = p_lead_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'no_email');
  end if;

  -- Campaign must be enrollable + visible to the caller.
  select c.id, c.org_id, c.user_id, c.status into v_camp
  from public.lit_campaigns c
  where c.id = p_campaign_id
    and c.status in ('active','draft','paused')
    and (
      c.org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid())
      or public.is_platform_admin(auth.uid())
    );
  if not found then return jsonb_build_object('ok', false, 'reason', 'campaign_not_found'); end if;

  -- Already enrolled? (idempotent — don't double-send)
  select status into v_existing
  from public.lit_campaign_contacts
  where campaign_id = p_campaign_id and email = v_email;
  if found then
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (p_lead_id, 'added_to_campaign',
            jsonb_build_object('campaign_id', p_campaign_id, 'already_enrolled', true, 'status', v_existing),
            auth.uid(), 'email');
    return jsonb_build_object('ok', true, 'already_enrolled', true, 'status', v_existing);
  end if;

  v_first := nullif(split_part(coalesce(v_name,''), ' ', 1), '');
  v_last  := nullif(trim(substring(coalesce(v_name,'') from position(' ' in coalesce(v_name,'')||' '))), '');

  insert into public.lit_campaign_contacts (
    org_id, user_id, campaign_id, email,
    first_name, last_name, display_name,
    status, current_step_id, next_send_at, merge_vars
  ) values (
    v_camp.org_id, v_camp.user_id, p_campaign_id, v_email,
    v_first, v_last, v_name,
    'pending', null, now(), '{}'::jsonb
  )
  on conflict (campaign_id, email) do nothing;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'added_to_campaign',
          jsonb_build_object('campaign_id', p_campaign_id, 'email', v_email::text),
          auth.uid(), 'email');

  return jsonb_build_object('ok', true, 'enrolled', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Cal.com booking URL config (stored in lit_internal_meta key 'cal_booking_url').
--    Read by anyone in the CRM; set by a platform admin only.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.lit_leadcrm_cal_config()
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_url text;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  select meta_value #>> '{}' into v_url
  from public.lit_internal_meta where meta_key = 'cal_booking_url';
  return jsonb_build_object(
    'ok', true,
    'configured', v_url is not null and v_url <> '',
    'cal_url', v_url,
    'can_configure', public.is_platform_admin(auth.uid())
  );
end;
$$;

create or replace function public.lit_admin_set_cal_url(p_url text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_clean text;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;
  v_clean := nullif(trim(coalesce(p_url, '')), '');
  if v_clean is not null and v_clean !~* '^https?://' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_url');
  end if;

  insert into public.lit_internal_meta (meta_key, meta_value, updated_at)
  values ('cal_booking_url', to_jsonb(v_clean), now())
  on conflict (meta_key) do update set meta_value = excluded.meta_value, updated_at = now();

  return jsonb_build_object('ok', true, 'cal_url', v_clean);
end;
$$;

-- Log a "book a call" click (the Cal.com link opens prefilled with the lead).
create or replace function public.lit_leadcrm_log_call_booking_opened(p_lead_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.lit_admin_leads where id = p_lead_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'call_booking_opened', jsonb_build_object('via', 'cal.com'), auth.uid(), 'manual')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'activity_id', v_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.lit_leadcrm_lead_email(uuid) from public;
revoke all on function public.lit_leadcrm_log_email_sent(uuid,text,text,text,text) from public;
revoke all on function public.lit_leadcrm_lead_threads(uuid) from public;
revoke all on function public.lit_leadcrm_log_demo_invite(uuid) from public;
revoke all on function public.lit_leadcrm_list_campaigns() from public;
revoke all on function public.lit_leadcrm_add_to_campaign(uuid,uuid) from public;
revoke all on function public.lit_leadcrm_cal_config() from public;
revoke all on function public.lit_admin_set_cal_url(text) from public;
revoke all on function public.lit_leadcrm_log_call_booking_opened(uuid) from public;

grant execute on function public.lit_leadcrm_lead_email(uuid) to authenticated;
grant execute on function public.lit_leadcrm_log_email_sent(uuid,text,text,text,text) to authenticated;
grant execute on function public.lit_leadcrm_lead_threads(uuid) to authenticated;
grant execute on function public.lit_leadcrm_log_demo_invite(uuid) to authenticated;
grant execute on function public.lit_leadcrm_list_campaigns() to authenticated;
grant execute on function public.lit_leadcrm_add_to_campaign(uuid,uuid) to authenticated;
grant execute on function public.lit_leadcrm_cal_config() to authenticated;
grant execute on function public.lit_admin_set_cal_url(text) to authenticated;
grant execute on function public.lit_leadcrm_log_call_booking_opened(uuid) to authenticated;
