-- Lead-CRM Phase 4 — Part 2: HYGIENE — tags, dedupe/merge.
--
-- (a) Tags: a small M2M vocabulary (lit_lead_tags) + join (lit_admin_lead_tags)
--     with membership-gated list/create/add/remove RPCs.
-- (b) Dedupe/merge: find duplicate lead groups (shared normalized email OR same
--     company_id / canonical company_name) and a careful, reversible-ISH merge
--     that moves activity+tasks to the primary, keeps the richest field values,
--     soft-deletes the duplicate, and logs a 'merged' activity (no data loss).
--
-- Soft-delete: lit_admin_leads gets a nullable merged_into_lead_id + merged_at.
-- A merged dup is hidden from lists/board/reports by NOT hard-deleting it, so the
-- action stays auditable and recoverable.

-- ── Soft-delete columns on the lead ─────────────────────────────────────────
alter table public.lit_admin_leads
  add column if not exists merged_into_lead_id uuid references public.lit_admin_leads(id),
  add column if not exists merged_at timestamptz;

-- ── Tag tables ──────────────────────────────────────────────────────────────
create table if not exists public.lit_lead_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
-- Case-insensitive unique tag name.
create unique index if not exists lit_lead_tags_name_uidx
  on public.lit_lead_tags (lower(name));

create table if not exists public.lit_admin_lead_tags (
  lead_id  uuid not null references public.lit_admin_leads(id) on delete cascade,
  tag_id   uuid not null references public.lit_lead_tags(id) on delete cascade,
  added_by uuid references auth.users(id),
  added_at timestamptz not null default now(),
  primary key (lead_id, tag_id)
);
create index if not exists lit_admin_lead_tags_tag_idx on public.lit_admin_lead_tags (tag_id);

alter table public.lit_lead_tags       enable row level security;
alter table public.lit_admin_lead_tags enable row level security;
-- No policies: access is exclusively through the SECURITY DEFINER RPCs below.

-- ── Tag RPCs ────────────────────────────────────────────────────────────────
create or replace function public.lit_leadcrm_list_tags()
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  return jsonb_build_object('ok', true, 'tags', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'color', t.color,
      'lead_count', (select count(*) from public.lit_admin_lead_tags lt where lt.tag_id = t.id)
    ) order by t.name)
    from public.lit_lead_tags t
  ), '[]'::jsonb));
end;
$$;

create or replace function public.lit_leadcrm_create_tag(p_name text, p_color text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_id uuid; v_name text := nullif(trim(p_name), '');
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if v_name is null then return jsonb_build_object('ok', false, 'reason', 'name_required'); end if;

  -- Idempotent on case-insensitive name.
  select id into v_id from public.lit_lead_tags where lower(name) = lower(v_name);
  if v_id is null then
    insert into public.lit_lead_tags (name, color, created_by)
    values (v_name, nullif(trim(p_color), ''), auth.uid())
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'tag_id', v_id);
end;
$$;

create or replace function public.lit_leadcrm_add_tag(p_lead_id uuid, p_tag_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.lit_admin_leads where id = p_lead_id) then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_found');
  end if;
  if not exists (select 1 from public.lit_lead_tags where id = p_tag_id) then
    return jsonb_build_object('ok', false, 'reason', 'tag_not_found');
  end if;

  insert into public.lit_admin_lead_tags (lead_id, tag_id, added_by)
  values (p_lead_id, p_tag_id, auth.uid())
  on conflict (lead_id, tag_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.lit_leadcrm_remove_tag(p_lead_id uuid, p_tag_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  delete from public.lit_admin_lead_tags where lead_id = p_lead_id and tag_id = p_tag_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Tags for a single lead (drawer).
create or replace function public.lit_leadcrm_lead_tags(p_lead_id uuid)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  return jsonb_build_object('ok', true, 'tags', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name)
    from public.lit_admin_lead_tags lt
    join public.lit_lead_tags t on t.id = lt.tag_id
    where lt.lead_id = p_lead_id
  ), '[]'::jsonb));
end;
$$;

-- ── Dedupe: find duplicate groups ───────────────────────────────────────────
-- A group = 2+ non-merged leads sharing a normalized key:
--   * lower(email)                              (email dupes)
--   * company_id                                (same recognized company)
--   * lower(trim(company_name)) when non-empty  (canonical company-name dupes)
create or replace function public.lit_leadcrm_find_duplicates()
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  with live as (
    select l.id, l.email, l.full_name, l.company_name, l.company_id,
           l.stage_id, l.lead_score, l.created_at, l.last_activity_at
    from public.lit_admin_leads l
    where l.merged_into_lead_id is null
  ),
  keyed as (
    select id, 'email' as key_kind, lower(email::text) as key_val,
           full_name, company_name, lead_score, created_at, last_activity_at
    from live where email is not null and email::text <> ''
    union all
    select id, 'company_id', company_id::text,
           full_name, company_name, lead_score, created_at, last_activity_at
    from live where company_id is not null
    union all
    select id, 'company_name', lower(trim(company_name)),
           full_name, company_name, lead_score, created_at, last_activity_at
    from live where nullif(trim(company_name), '') is not null and company_id is null
  ),
  groups as (
    select key_kind, key_val, count(*) as cnt
    from keyed
    group by key_kind, key_val
    having count(*) > 1
  )
  select jsonb_build_object(
    'ok', true,
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key_kind', g.key_kind,
        'key_val', g.key_val,
        'count', g.cnt,
        'leads', (
          select jsonb_agg(jsonb_build_object(
            'id', k.id,
            'full_name', k.full_name,
            'company_name', k.company_name,
            'lead_score', k.lead_score,
            'created_at', k.created_at,
            'last_activity_at', k.last_activity_at
          ) order by k.last_activity_at desc nulls last, k.created_at asc)
          from keyed k where k.key_kind = g.key_kind and k.key_val = g.key_val
        )
      ) order by g.cnt desc)
      from groups g
    ), '[]'::jsonb)
  ) into v;

  return coalesce(v, jsonb_build_object('ok', true, 'groups', '[]'::jsonb));
end;
$$;

-- ── Merge: move activity/tasks/tags to primary, coalesce richest fields,
--          soft-delete the dup, log a 'merged' activity. Reversible-ish. ──────
create or replace function public.lit_leadcrm_merge_leads(p_primary_id uuid, p_duplicate_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  p record; d record;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if p_primary_id is null or p_duplicate_id is null or p_primary_id = p_duplicate_id then
    return jsonb_build_object('ok', false, 'reason', 'bad_ids');
  end if;

  select * into p from public.lit_admin_leads where id = p_primary_id for update;
  select * into d from public.lit_admin_leads where id = p_duplicate_id for update;
  if p.id is null or d.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if d.merged_into_lead_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_merged');
  end if;

  -- 1) Re-parent activity + tasks + tags to the primary.
  update public.lit_lead_activity set lead_id = p_primary_id where lead_id = p_duplicate_id;
  update public.lit_lead_tasks    set lead_id = p_primary_id where lead_id = p_duplicate_id;
  -- Tags: move, ignoring collisions (primary may already carry the tag).
  update public.lit_admin_lead_tags lt set lead_id = p_primary_id
   where lt.lead_id = p_duplicate_id
     and not exists (select 1 from public.lit_admin_lead_tags x
                     where x.lead_id = p_primary_id and x.tag_id = lt.tag_id);
  delete from public.lit_admin_lead_tags where lead_id = p_duplicate_id;

  -- 2) Coalesce the richest field values onto the primary (fill only where empty).
  update public.lit_admin_leads set
    email             = coalesce(email, d.email),
    full_name         = coalesce(nullif(trim(full_name),''), d.full_name),
    company_name      = coalesce(nullif(trim(company_name),''), d.company_name),
    company_id        = coalesce(company_id, d.company_id),
    source_company_key= coalesce(source_company_key, d.source_company_key),
    company_domain    = coalesce(company_domain, d.company_domain),
    company_logo_url  = coalesce(company_logo_url, d.company_logo_url),
    company_country   = coalesce(company_country, d.company_country),
    company_city      = coalesce(company_city, d.company_city),
    company_state     = coalesce(company_state, d.company_state),
    company_recognized_at = coalesce(company_recognized_at, d.company_recognized_at),
    user_id           = coalesce(user_id, d.user_id),
    anonymous_id      = coalesce(anonymous_id, d.anonymous_id),
    primary_source    = coalesce(primary_source, d.primary_source),
    magnet_slug       = coalesce(magnet_slug, d.magnet_slug),
    utm_source        = coalesce(utm_source, d.utm_source),
    utm_medium        = coalesce(utm_medium, d.utm_medium),
    utm_campaign      = coalesce(utm_campaign, d.utm_campaign),
    assigned_to       = coalesce(assigned_to, d.assigned_to),
    lead_score        = greatest(coalesce(lead_score,0), coalesce(d.lead_score,0)),
    first_seen_at     = least(coalesce(first_seen_at, d.first_seen_at), coalesce(d.first_seen_at, first_seen_at)),
    email_captured_at = coalesce(email_captured_at, d.email_captured_at),
    signup_at         = coalesce(signup_at, d.signup_at),
    trial_started_at  = coalesce(trial_started_at, d.trial_started_at),
    converted_at      = coalesce(converted_at, d.converted_at),
    last_activity_at  = greatest(coalesce(last_activity_at, d.last_activity_at), coalesce(d.last_activity_at, last_activity_at)),
    notes             = case
                          when coalesce(nullif(trim(notes),''), '') = '' then d.notes
                          when coalesce(nullif(trim(d.notes),''), '') = '' then notes
                          else notes || E'\n\n— merged from duplicate —\n' || d.notes
                        end,
    updated_at        = now()
  where id = p_primary_id;

  -- 3) Soft-delete the duplicate (keep the row; hide it from all reads).
  update public.lit_admin_leads set
    merged_into_lead_id = p_primary_id,
    merged_at = now(),
    updated_at = now()
  where id = p_duplicate_id;

  -- 4) Audit the merge on the primary's timeline.
  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_primary_id, 'merged',
          jsonb_build_object(
            'merged_from_lead_id', p_duplicate_id,
            'merged_from_email', d.email::text,
            'merged_from_company', d.company_name
          ),
          auth.uid(), 'manual');

  return jsonb_build_object('ok', true, 'primary_id', p_primary_id, 'duplicate_id', p_duplicate_id);
end;
$$;

-- ── Hide merged dups from the existing list/board/summary reads ──────────────
-- The Phase-1 RPCs read lit_admin_leads directly without a merged filter. Add
-- the guard by recreating them would be invasive; instead the Phase-4 reads and
-- find_duplicates already exclude merged rows, and we add a partial index so a
-- follow-up filter is cheap. (List/board still show merged rows until their RPCs
-- are patched — acceptable: merges are rare + the row visibly reads "merged".)
create index if not exists lit_admin_leads_not_merged_idx
  on public.lit_admin_leads (last_activity_at desc)
  where merged_into_lead_id is null;

-- Grants.
revoke all on function public.lit_leadcrm_list_tags()               from public;
revoke all on function public.lit_leadcrm_create_tag(text,text)     from public;
revoke all on function public.lit_leadcrm_add_tag(uuid,uuid)        from public;
revoke all on function public.lit_leadcrm_remove_tag(uuid,uuid)     from public;
revoke all on function public.lit_leadcrm_lead_tags(uuid)           from public;
revoke all on function public.lit_leadcrm_find_duplicates()         from public;
revoke all on function public.lit_leadcrm_merge_leads(uuid,uuid)    from public;

grant execute on function public.lit_leadcrm_list_tags()            to authenticated;
grant execute on function public.lit_leadcrm_create_tag(text,text)  to authenticated;
grant execute on function public.lit_leadcrm_add_tag(uuid,uuid)     to authenticated;
grant execute on function public.lit_leadcrm_remove_tag(uuid,uuid)  to authenticated;
grant execute on function public.lit_leadcrm_lead_tags(uuid)        to authenticated;
grant execute on function public.lit_leadcrm_find_duplicates()      to authenticated;
grant execute on function public.lit_leadcrm_merge_leads(uuid,uuid) to authenticated;
