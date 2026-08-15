-- Lead-CRM Phase 4 — Part 4: Attio IMPORT upsert RPC.
--
-- The `lead-crm-attio-import` edge function (requireUser + is_platform_admin)
-- normalizes each Attio export record to a flat shape and calls this ONE RPC
-- per record. Keeping the upsert in SQL makes it idempotent + dedupe-correct
-- (email OR canonical company name), and lets it reuse the existing recognizer
-- + activity table exactly like the manual create paths.
--
-- Idempotency: dedupe on lower(email) first, else on lower(trim(company_name)).
-- Re-running the same export updates (coalesce-fills) the existing lead rather
-- than creating a second one. Notes/activities import as source='attio_import'
-- and dedupe on a stable content hash so a re-run doesn't duplicate them.

create or replace function public.lit_leadcrm_attio_upsert(
  p_email        text default null,
  p_full_name    text default null,
  p_company_name text default null,
  p_stage_name   text default null,   -- best-effort map to a pipeline stage
  p_notes        jsonb default '[]'::jsonb,  -- array of { body, occurred_at? }
  p_attio_id     text default null    -- source Attio record id (kept in body for traceability)
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_email   citext := nullif(lower(trim(p_email)), '')::citext;
  v_company text  := nullif(trim(p_company_name), '');
  v_lead_id uuid;
  v_created boolean := false;
  v_stage   uuid;
  v_note    jsonb;
  v_body    text;
  v_hash    text;
  v_notes_added int := 0;
begin
  -- platform-admin only (edge fn also checks; defense in depth).
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;

  if v_email is null and v_company is null then
    return jsonb_build_object('ok', false, 'reason', 'need_email_or_company');
  end if;

  -- Map an Attio stage name onto a LIT pipeline stage (case-insensitive contains).
  if nullif(trim(p_stage_name), '') is not null then
    select id into v_stage
    from public.lit_lead_pipeline_stages
    where lower(name) = lower(trim(p_stage_name))
    limit 1;
    if v_stage is null then
      -- fuzzy: 'trial started' → Trial, 'won'/'subscriber'/'customer' → Subscriber, etc.
      select id into v_stage from public.lit_lead_pipeline_stages st
      where (lower(p_stage_name) like '%subscri%' or lower(p_stage_name) like '%won%'
             or lower(p_stage_name) like '%customer%') and st.is_won
      limit 1;
      if v_stage is null then
        select id into v_stage from public.lit_lead_pipeline_stages st
        where (lower(p_stage_name) like '%lost%' or lower(p_stage_name) like '%closed lost%') and st.is_lost
        limit 1;
      end if;
      if v_stage is null then
        select id into v_stage from public.lit_lead_pipeline_stages
        where lower(name) = case
          when lower(p_stage_name) like '%trial%'   then 'trial'
          when lower(p_stage_name) like '%demo%'    then 'engaged'
          when lower(p_stage_name) like '%qualif%'  then 'engaged'
          when lower(p_stage_name) like '%contact%' then 'contacted'
          when lower(p_stage_name) like '%negoti%'  then 'engaged'
          else 'new' end
        limit 1;
      end if;
    end if;
  end if;

  -- 1) Dedupe: email first, then canonical company name (non-merged only).
  if v_email is not null then
    select id into v_lead_id from public.lit_admin_leads
    where merged_into_lead_id is null and email = v_email
    order by created_at asc limit 1;
  end if;
  if v_lead_id is null and v_company is not null then
    select id into v_lead_id from public.lit_admin_leads
    where merged_into_lead_id is null and lower(trim(company_name)) = lower(v_company)
    order by created_at asc limit 1;
  end if;

  -- 2) Insert or coalesce-update.
  if v_lead_id is null then
    insert into public.lit_admin_leads (
      email, full_name, company_name, primary_source, stage_id, status, lead_score
    ) values (
      v_email, nullif(trim(p_full_name),''), v_company, 'attio_import',
      coalesce(v_stage, (select id from public.lit_lead_pipeline_stages where position=0 limit 1)),
      coalesce((
        select case when st.is_won then 'converted' when st.is_lost then 'lost' else 'open' end
        from public.lit_lead_pipeline_stages st where st.id = v_stage
      ), 'open'),
      0
    )
    returning id into v_lead_id;
    v_created := true;
  else
    update public.lit_admin_leads set
      email        = coalesce(email, v_email),
      full_name    = coalesce(nullif(trim(full_name),''), nullif(trim(p_full_name),'')),
      company_name = coalesce(nullif(trim(company_name),''), v_company),
      stage_id     = coalesce(stage_id, v_stage),
      updated_at   = now()
    where id = v_lead_id;
  end if;

  -- 3) Run company recognition (cached reads, 0 provider credits) — best-effort.
  begin
    perform public.lit_leadcrm_recognize_company(v_lead_id);
  exception when others then null;
  end;

  -- 4) Import notes as activity rows (source='attio_import'), deduped by hash.
  for v_note in select * from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb))
  loop
    v_body := nullif(trim(coalesce(v_note->>'body', '')), '');
    continue when v_body is null;
    v_hash := md5(v_lead_id::text || '|' || v_body);
    if not exists (
      select 1 from public.lit_lead_activity
      where lead_id = v_lead_id and source = 'attio_import' and body->>'hash' = v_hash
    ) then
      insert into public.lit_lead_activity (lead_id, kind, body, source, occurred_at)
      values (
        v_lead_id, 'note',
        jsonb_build_object('text', v_body, 'hash', v_hash, 'attio_id', p_attio_id, 'imported', true),
        'attio_import',
        coalesce((v_note->>'occurred_at')::timestamptz, now())
      );
      v_notes_added := v_notes_added + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'lead_id', v_lead_id, 'created', v_created,
    'notes_added', v_notes_added
  );
end;
$$;

revoke all on function public.lit_leadcrm_attio_upsert(text,text,text,text,jsonb,text) from public;
grant execute on function public.lit_leadcrm_attio_upsert(text,text,text,text,jsonb,text) to authenticated;
