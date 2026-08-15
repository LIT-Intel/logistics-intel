-- Lead-CRM structural fix — Part 4: make company-first leads possible.
--
-- Owner intent (verbatim): "in the broker list, we can use these as leads in
-- the crm ... structurally create this to pull data from every function inside
-- LIT already." Many LIT companies (brokers, forwarders, directory rows) have
-- NO email until enriched, so a lead must be able to exist keyed only on a
-- company (company_id / source_company_key / company_name) with a null email.
--
-- This migration:
--   1. Makes lit_admin_leads.email NULLABLE.
--   2. Replaces the plain unique(email) with a PARTIAL unique index that only
--      applies where email is not null — so multiple email-less company leads
--      are allowed, while email uniqueness is still enforced for real emails.
--   3. Rewrites lit_leadcrm_create_lead to require (email OR company_name):
--      when email is null it still creates the lead + runs recognition, and
--      dedupes by recognized company / normalized company name instead of email.
--
-- Cached reads only — no provider credits. Membership-gated (is_lead_crm_member).

-- ── 1 + 2. Email nullable + partial unique index ───────────────────────────
alter table public.lit_admin_leads
  alter column email drop not null;

-- Drop the old plain unique index/constraint on email (it was created as a
-- UNIQUE constraint `lit_admin_leads_email_key`). Dropping the constraint drops
-- its backing index. Guard in case a prior run already removed it.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'lit_admin_leads_email_key'
      and conrelid = 'public.lit_admin_leads'::regclass
  ) then
    alter table public.lit_admin_leads drop constraint lit_admin_leads_email_key;
  end if;
end$$;

-- Partial unique: email must stay unique when present, but many rows may have
-- a null email (company-only leads).
create unique index if not exists lit_admin_leads_email_uniq
  on public.lit_admin_leads (email)
  where email is not null;

-- Helpful for company-based dedupe on email-less leads (normalized name lookup).
create index if not exists idx_lit_admin_leads_company_name_lower
  on public.lit_admin_leads (lower(company_name))
  where email is null;

-- ── 3. create_lead: email OR company (not email-only) ──────────────────────
-- Same signature (keeps the existing typed wrapper + grants), but:
--   • email is now OPTIONAL
--   • requires at least ONE of (email, company_name)
--   • dedupes on email when present, else on recognized company / normalized name
create or replace function public.lit_leadcrm_create_lead(
  p_email        text default null,
  p_full_name    text default null,
  p_company_name text default null,
  p_stage_id     uuid default null,
  p_assignee     uuid default null,
  p_notes        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email    citext;
  v_company  text := nullif(btrim(p_company_name), '');
  v_cn       text;
  v_lead_id  uuid;
  v_existing uuid;
  v_stage    uuid := p_stage_id;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  -- Normalize/validate email only when supplied. A blank email is allowed.
  v_email := nullif(btrim(lower(coalesce(p_email, ''))), '')::citext;
  if v_email is not null and v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  -- Require at least an email OR a company name.
  if v_email is null and v_company is null then
    return jsonb_build_object('ok', false, 'reason', 'email_or_company_required');
  end if;

  -- ── Dedupe.
  if v_email is not null then
    -- Idempotent on email (unchanged behavior).
    select id into v_existing from public.lit_admin_leads where email = v_email;
  elsif v_company is not null then
    -- Email-less: dedupe on an existing email-less lead with the same
    -- normalized company name (avoids duplicate broker/company opportunities).
    v_cn := public.lit_canonicalize_name(v_company);
    if v_cn is not null and length(v_cn) >= 2 then
      select id into v_existing
      from public.lit_admin_leads
      where email is null
        and public.lit_canonicalize_name(company_name) = v_cn
      order by created_at asc
      limit 1;
    end if;
  end if;

  if v_existing is not null then
    update public.lit_admin_leads
       set full_name    = coalesce(nullif(btrim(p_full_name),''), full_name),
           company_name = coalesce(v_company, company_name),
           assigned_to  = coalesce(p_assignee, assigned_to),
           stage_id     = coalesce(p_stage_id, stage_id),
           notes        = coalesce(nullif(btrim(p_notes),''), notes),
           updated_at   = now()
     where id = v_existing;
    perform public.lit_leadcrm_recognize_company(v_existing);
    return jsonb_build_object('ok', true, 'lead_id', v_existing, 'created', false, 'merged', true);
  end if;

  -- Default stage = lowest-position (New) when not supplied.
  if v_stage is null then
    select id into v_stage from public.lit_lead_pipeline_stages order by position asc limit 1;
  end if;

  insert into public.lit_admin_leads
    (email, full_name, company_name, primary_source, stage_id, assigned_to, notes,
     status, first_seen_at, last_activity_at)
  values
    (v_email, nullif(btrim(p_full_name),''), v_company,
     'manual', v_stage, p_assignee, nullif(btrim(p_notes),''),
     'open', now(), now())
  returning id into v_lead_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (v_lead_id, 'created',
          jsonb_build_object('email', v_email::text, 'source', 'manual',
                             'company', v_company),
          auth.uid(), 'manual');

  if p_assignee is not null then
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (v_lead_id, 'assignment',
            jsonb_build_object('assignee_user_id', p_assignee), auth.uid(), 'manual');
  end if;

  -- Best-effort auto-recognition (cached reads only).
  perform public.lit_leadcrm_recognize_company(v_lead_id);

  return jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'created', true, 'merged', false);
end;
$$;

comment on function public.lit_leadcrm_create_lead(text,text,text,uuid,uuid,text) is
  'Manually add an opportunity. Requires email OR company_name (email now OPTIONAL). Idempotent on email, else dedupes on normalized company name for email-less leads. Auto-runs company recognition. 0 provider credits.';

revoke all on function public.lit_leadcrm_create_lead(text,text,text,uuid,uuid,text) from public;
grant execute on function public.lit_leadcrm_create_lead(text,text,text,uuid,uuid,text) to authenticated;
