-- Lead-CRM — manual edit of a lead's contact + company details.
--
-- Adds editable contact/company fields to lit_admin_leads and a membership-gated
-- PATCH RPC (lit_leadcrm_update_lead) so a rep can hand-enter the missing email /
-- phone / title / company website / address when auto-recognition failed (real
-- case: "Nate May" @ "General Noli" with no email + an unrecognized company).
--
-- Once a website/domain is saved by hand, contact enrichment is unblocked (the
-- lead-crm-enrich-contacts edge fn now accepts a manual company_domain OR name),
-- so this migration is the DB half of that flow.
--
-- PATCH semantics: every param is nullable and only NON-null params are written.
-- An explicitly-sent empty string CLEARS the field (nullif(btrim(x),'')); an
-- OMITTED (null) param leaves the existing value untouched. The website drives a
-- derived company_domain (host, lowercased) + a refreshed logo.dev URL when the
-- caller didn't supply a domain, matching lit_leadcrm_recognize_company's
-- 'https://img.logo.dev/<domain>?size=160' builder.

-- ── 1) New editable columns (all nullable, additive) ─────────────────────────
alter table public.lit_admin_leads
  add column if not exists phone   text,
  add column if not exists title   text,
  add column if not exists website text,
  add column if not exists address text;

-- ── 2) PATCH RPC ─────────────────────────────────────────────────────────────
create or replace function public.lit_leadcrm_update_lead(
  p_lead_id         uuid,
  p_full_name       text default null,
  p_email           text default null,
  p_phone           text default null,
  p_title           text default null,
  p_company_name    text default null,
  p_website         text default null,
  p_company_domain  text default null,
  p_address         text default null,
  p_company_city    text default null,
  p_company_state   text default null,
  p_company_country text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  cur           public.lit_admin_leads%rowtype;
  v_new_email   text;
  v_new_website text;
  v_new_domain  text;
  v_domain_from_site text;
  v_logo_url    text;
  v_domain_changed boolean := false;
  v_changed     text[] := '{}';
begin
  if not public.is_lead_crm_member(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select * into cur from public.lit_admin_leads where id = p_lead_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- PATCH helper: null param => keep existing; provided => trim, empty => clear.
  -- (email handled separately for the unique-conflict pre-check + citext cast.)
  v_new_email   := case when p_email          is null then cur.email::text else nullif(btrim(p_email), '') end;
  v_new_website := case when p_website         is null then cur.website     else nullif(btrim(p_website), '') end;

  -- Domain resolution:
  --   * explicit p_company_domain wins;
  --   * else derive host from the (new) website when a website was provided;
  --   * else keep the existing domain.
  if p_company_domain is not null then
    v_new_domain := nullif(lower(btrim(p_company_domain)), '');
  elsif p_website is not null then
    -- derive host from website: strip scheme, strip path/query, lowercase.
    v_domain_from_site := nullif(
      lower(btrim(regexp_replace(regexp_replace(coalesce(v_new_website, ''), '^\s*https?://', '', 'i'), '[/?#].*$', ''))),
      ''
    );
    -- drop a leading www. so logo.dev + enrichment key on the bare host.
    v_domain_from_site := regexp_replace(coalesce(v_domain_from_site, ''), '^www\.', '');
    v_domain_from_site := nullif(v_domain_from_site, '');
    v_new_domain := coalesce(v_domain_from_site, cur.company_domain);
  else
    v_new_domain := cur.company_domain;
  end if;

  v_domain_changed := coalesce(v_new_domain, '') <> coalesce(cur.company_domain, '');

  -- Refresh the logo.dev URL only when the domain actually changed. If the domain
  -- was cleared, clear the logo too; otherwise rebuild from the new host.
  if v_domain_changed then
    v_logo_url := case when v_new_domain is not null
                       then 'https://img.logo.dev/' || v_new_domain || '?size=160'
                       else null end;
  else
    v_logo_url := cur.company_logo_url;
  end if;

  -- Email-conflict pre-check: the partial-unique(email) index rejects a dup.
  -- Return a graceful reason instead of a raw 23505 when the target email is
  -- already used by a DIFFERENT lead.
  if v_new_email is not null and v_new_email is distinct from cur.email::text then
    if exists (
      select 1 from public.lit_admin_leads
      where email = v_new_email::citext and id <> p_lead_id
    ) then
      return jsonb_build_object('ok', false, 'reason', 'email_in_use');
    end if;
  end if;

  -- Track which keys changed (for the activity log).
  if v_new_email                is distinct from cur.email::text     then v_changed := v_changed || 'email'; end if;
  if (case when p_full_name       is null then cur.full_name       else nullif(btrim(p_full_name),'')       end) is distinct from cur.full_name       then v_changed := v_changed || 'full_name'; end if;
  if (case when p_phone           is null then cur.phone           else nullif(btrim(p_phone),'')           end) is distinct from cur.phone           then v_changed := v_changed || 'phone'; end if;
  if (case when p_title           is null then cur.title           else nullif(btrim(p_title),'')           end) is distinct from cur.title           then v_changed := v_changed || 'title'; end if;
  if (case when p_company_name    is null then cur.company_name    else nullif(btrim(p_company_name),'')    end) is distinct from cur.company_name    then v_changed := v_changed || 'company_name'; end if;
  if v_new_website              is distinct from cur.website        then v_changed := v_changed || 'website'; end if;
  if v_new_domain               is distinct from cur.company_domain then v_changed := v_changed || 'company_domain'; end if;
  if (case when p_address         is null then cur.address         else nullif(btrim(p_address),'')         end) is distinct from cur.address         then v_changed := v_changed || 'address'; end if;
  if (case when p_company_city    is null then cur.company_city    else nullif(btrim(p_company_city),'')    end) is distinct from cur.company_city    then v_changed := v_changed || 'company_city'; end if;
  if (case when p_company_state   is null then cur.company_state   else nullif(btrim(p_company_state),'')   end) is distinct from cur.company_state   then v_changed := v_changed || 'company_state'; end if;
  if (case when p_company_country is null then cur.company_country else nullif(btrim(p_company_country),'') end) is distinct from cur.company_country then v_changed := v_changed || 'company_country'; end if;

  begin
    update public.lit_admin_leads set
      full_name       = case when p_full_name       is null then full_name       else nullif(btrim(p_full_name), '')       end,
      email           = v_new_email::citext,
      phone           = case when p_phone           is null then phone           else nullif(btrim(p_phone), '')           end,
      title           = case when p_title           is null then title           else nullif(btrim(p_title), '')           end,
      company_name    = case when p_company_name    is null then company_name    else nullif(btrim(p_company_name), '')    end,
      website         = v_new_website,
      company_domain  = v_new_domain,
      company_logo_url= v_logo_url,
      address         = case when p_address         is null then address         else nullif(btrim(p_address), '')         end,
      company_city    = case when p_company_city    is null then company_city    else nullif(btrim(p_company_city), '')    end,
      company_state   = case when p_company_state   is null then company_state   else nullif(btrim(p_company_state), '')   end,
      company_country = case when p_company_country is null then company_country else nullif(btrim(p_company_country), '') end,
      updated_at      = now()
    where id = p_lead_id;
  exception when unique_violation then
    -- Belt-and-suspenders: race between the pre-check and the write.
    return jsonb_build_object('ok', false, 'reason', 'email_in_use');
  end;

  -- Timeline breadcrumb — record the changed keys (manual source).
  begin
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (
      p_lead_id,
      'lead_updated',
      jsonb_build_object('changed', to_jsonb(v_changed)),
      auth.uid(),
      'manual'
    );
  exception when others then
    null; -- non-fatal
  end;

  return jsonb_build_object('ok', true, 'lead_id', p_lead_id);
end;
$function$;

revoke all on function public.lit_leadcrm_update_lead(uuid,text,text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.lit_leadcrm_update_lead(uuid,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- ── 3) Extend get_lead to return the new editable fields ─────────────────────
-- Rebuilds the same envelope with phone/title/website/address added to `lead`.
create or replace function public.lit_leadcrm_get_lead(p_lead_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select jsonb_build_object(
    'ok', true,
    'lead', jsonb_build_object(
      'id', l.id, 'email', l.email::text, 'full_name', l.full_name, 'company_name', l.company_name,
      'phone', l.phone, 'title', l.title, 'website', l.website, 'address', l.address,
      'primary_source', l.primary_source, 'magnet_slug', l.magnet_slug,
      'utm_source', l.utm_source, 'utm_medium', l.utm_medium, 'utm_campaign', l.utm_campaign,
      'stage_id', l.stage_id, 'stage_name', st.name, 'stage_position', st.position, 'stage_color', st.color,
      'status', l.status, 'lead_score', l.lead_score,
      'assigned_to', l.assigned_to, 'assignee_email', ap.email, 'assignee_name', ap.full_name,
      'anonymous_id', l.anonymous_id, 'notes', l.notes, 'is_stale', l.is_stale,
      'company_id', l.company_id, 'source_company_key', l.source_company_key,
      'company_domain', l.company_domain, 'company_logo_url', l.company_logo_url,
      'company_country', l.company_country, 'company_city', l.company_city,
      'company_state', l.company_state, 'company_recognized_at', l.company_recognized_at,
      'first_seen_at', l.first_seen_at, 'email_captured_at', l.email_captured_at,
      'signup_at', l.signup_at, 'trial_started_at', l.trial_started_at,
      'converted_at', l.converted_at, 'last_activity_at', l.last_activity_at,
      'created_at', l.created_at, 'updated_at', l.updated_at
    ),
    'user', case when l.user_id is null then null else jsonb_build_object(
      'user_id', l.user_id, 'email', up.email, 'full_name', up.full_name,
      'company_name', coalesce(up.company_name, up.organization_name)
    ) end,
    'subscription', (
      select jsonb_build_object('status', s.status, 'plan_code', s.plan_code,
                                'trial_ends_at', s.trial_ends_at,
                                'current_period_end', s.current_period_end)
      from public.subscriptions s where s.user_id = l.user_id
      order by s.updated_at desc nulls last limit 1
    ),
    'activation', case when l.user_id is null then null else (
      select jsonb_build_object('current_plan', a.current_plan, 'current_status', a.current_status,
                                'signup_at', a.signup_at, 'trial_started_at', a.trial_started_at,
                                'converted_paid_at', a.converted_paid_at, 'last_active_at', a.last_active_at,
                                'activity_count_30d', a.activity_count_30d)
      from public.lit_user_activation a where a.user_id = l.user_id
    ) end
  ) into v
  from public.lit_admin_leads l
  left join public.lit_lead_pipeline_stages st on st.id = l.stage_id
  left join public.profiles ap on ap.id = l.assigned_to
  left join public.profiles up on up.id = l.user_id
  where l.id = p_lead_id;

  if v is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return v;
end;
$function$;
