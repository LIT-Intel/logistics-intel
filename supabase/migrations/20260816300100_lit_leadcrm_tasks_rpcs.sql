-- Lead-CRM CORE completion (part 2): Tasks RPCs over the existing
-- lit_lead_tasks table (id, lead_id, title, due_date, status, assignee_user_id,
-- created_by, completed_at, created_at). All membership-gated; task_created /
-- task_completed logged to lit_lead_activity.

-- ── List one lead's tasks (open first, then by due date) ─────────────────────
create or replace function public.lit_leadcrm_lead_tasks(p_lead_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_rows jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select coalesce(jsonb_agg(t order by t.sort_key), '[]'::jsonb) into v_rows
  from (
    select
      jsonb_build_object(
        'id', tk.id,
        'lead_id', tk.lead_id,
        'title', tk.title,
        'due_date', tk.due_date,
        'status', tk.status,
        'assignee_user_id', tk.assignee_user_id,
        'assignee_name', ap.full_name,
        'assignee_email', ap.email,
        'created_by', tk.created_by,
        'completed_at', tk.completed_at,
        'created_at', tk.created_at,
        'overdue', (tk.status = 'open' and tk.due_date is not null and tk.due_date < current_date)
      ) as t,
      (case when tk.status = 'open' then 0 else 1 end) as sort_key_a,
      coalesce(tk.due_date, date '9999-12-31') as sort_key
    from public.lit_lead_tasks tk
    left join public.profiles ap on ap.id = tk.assignee_user_id
    where tk.lead_id = p_lead_id
    order by sort_key_a, sort_key
  ) t;

  return jsonb_build_object('ok', true, 'tasks', v_rows);
end;
$function$;

-- ── Create a follow-up task on a lead ────────────────────────────────────────
create or replace function public.lit_leadcrm_create_task(
  p_lead_id uuid,
  p_title text,
  p_due_date date default null,
  p_assignee uuid default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid; v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if v_title is null then return jsonb_build_object('ok', false, 'reason', 'title_required'); end if;
  if not exists (select 1 from public.lit_admin_leads where id = p_lead_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_assignee is not null and not public.is_lead_crm_member(p_assignee) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_assignee');
  end if;

  insert into public.lit_lead_tasks (lead_id, title, due_date, status, assignee_user_id, created_by)
  values (p_lead_id, v_title, p_due_date, 'open', coalesce(p_assignee, auth.uid()), auth.uid())
  returning id into v_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'task_created',
          jsonb_build_object('task_id', v_id, 'title', v_title, 'due_date', p_due_date),
          auth.uid(), 'manual');

  update public.lit_admin_leads set last_activity_at = now(), updated_at = now() where id = p_lead_id;

  return jsonb_build_object('ok', true, 'task_id', v_id);
end;
$function$;

-- ── Mark a task done / reopen ────────────────────────────────────────────────
create or replace function public.lit_leadcrm_complete_task(p_task_id uuid, p_done boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_lead uuid; v_title text;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  update public.lit_lead_tasks
     set status = case when p_done then 'done' else 'open' end,
         completed_at = case when p_done then now() else null end
   where id = p_task_id
   returning lead_id, title into v_lead, v_title;

  if v_lead is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (v_lead, case when p_done then 'task_completed' else 'task_reopened' end,
          jsonb_build_object('task_id', p_task_id, 'title', v_title),
          auth.uid(), 'manual');

  update public.lit_admin_leads set last_activity_at = now(), updated_at = now() where id = v_lead;

  return jsonb_build_object('ok', true);
end;
$function$;

-- ── My open / overdue tasks for the shell Tasks tab ──────────────────────────
-- p_status: 'open' (default), 'overdue', 'done', 'all'. p_assignee defaults to
-- the caller; managers/admins can pass a specific member (still membership-gated).
create or replace function public.lit_leadcrm_my_tasks(
  p_assignee uuid default null,
  p_status text default 'open'
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_rows jsonb; v_assignee uuid := coalesce(p_assignee, auth.uid()); v_status text := lower(coalesce(p_status, 'open'));
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select coalesce(jsonb_agg(t order by t.sort_key), '[]'::jsonb) into v_rows
  from (
    select
      jsonb_build_object(
        'id', tk.id,
        'lead_id', tk.lead_id,
        'title', tk.title,
        'due_date', tk.due_date,
        'status', tk.status,
        'assignee_user_id', tk.assignee_user_id,
        'assignee_name', ap.full_name,
        'completed_at', tk.completed_at,
        'created_at', tk.created_at,
        'overdue', (tk.status = 'open' and tk.due_date is not null and tk.due_date < current_date),
        'lead_name', coalesce(nullif(btrim(l.full_name), ''),
                              case when l.email is not null then split_part(l.email::text, '@', 1) else null end,
                              l.company_name, 'Lead'),
        'lead_company', l.company_name,
        'lead_email', l.email::text
      ) as t,
      coalesce(tk.due_date, date '9999-12-31') as sort_key
    from public.lit_lead_tasks tk
    join public.lit_admin_leads l on l.id = tk.lead_id
    left join public.profiles ap on ap.id = tk.assignee_user_id
    where (v_assignee is null or tk.assignee_user_id = v_assignee)
      and (
        (v_status = 'open'    and tk.status = 'open') or
        (v_status = 'overdue' and tk.status = 'open' and tk.due_date is not null and tk.due_date < current_date) or
        (v_status = 'done'    and tk.status = 'done') or
        (v_status = 'all')
      )
      and (l.user_id is null
        or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
    order by sort_key
  ) t;

  return jsonb_build_object('ok', true, 'tasks', v_rows);
end;
$function$;

grant execute on function public.lit_leadcrm_lead_tasks(uuid) to authenticated;
grant execute on function public.lit_leadcrm_create_task(uuid, text, date, uuid) to authenticated;
grant execute on function public.lit_leadcrm_complete_task(uuid, boolean) to authenticated;
grant execute on function public.lit_leadcrm_my_tasks(uuid, text) to authenticated;
