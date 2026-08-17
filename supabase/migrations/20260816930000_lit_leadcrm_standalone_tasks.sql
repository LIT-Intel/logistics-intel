-- Lead-CRM Tasks UI overhaul (Aug 2026): allow STANDALONE tasks (no lead).
--
-- The shell Tasks tab gets a real "＋ New task" composer. A task may now be a
-- plain personal follow-up NOT tied to any lead (linking a lead stays optional
-- via a typeahead). To support that we:
--   1) make lit_lead_tasks.lead_id NULLABLE (was NOT NULL → lit_admin_leads),
--   2) extend lit_leadcrm_create_task so p_lead_id may be NULL — when null we
--      skip the lit_lead_activity insert (activity is keyed by lead_id) and the
--      lead last_activity_at bump; a linked lead behaves exactly as before,
--   3) extend lit_leadcrm_my_tasks to LEFT JOIN the lead so standalone tasks
--      still appear (lead_* fields null), grouped by due date like the rest.
--
-- Idempotent + non-destructive: existing lead-linked tasks are untouched.
-- Mirror this to prod via `supabase db push` (or Supabase MCP apply_migration).

BEGIN;

-- 1) Drop the NOT NULL on lead_id (keep the FK + ON DELETE CASCADE for linked rows).
ALTER TABLE public.lit_lead_tasks
  ALTER COLUMN lead_id DROP NOT NULL;

-- 2) create_task — accept a null lead (standalone task). Only validate the
--    lead + write activity when a lead is actually linked.
CREATE OR REPLACE FUNCTION public.lit_leadcrm_create_task(
  p_lead_id uuid,
  p_title text,
  p_due_date date DEFAULT NULL,
  p_assignee uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if v_title is null then return jsonb_build_object('ok', false, 'reason', 'title_required'); end if;

  -- A linked lead must exist; a null lead means a standalone personal task.
  if p_lead_id is not null and not exists (select 1 from public.lit_admin_leads where id = p_lead_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_assignee is not null and not public.is_lead_crm_member(p_assignee) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_assignee');
  end if;

  insert into public.lit_lead_tasks (lead_id, title, due_date, status, assignee_user_id, created_by)
  values (p_lead_id, v_title, p_due_date, 'open', coalesce(p_assignee, auth.uid()), auth.uid())
  returning id into v_id;

  -- Activity + last_activity are lead-scoped; only log when a lead is linked.
  if p_lead_id is not null then
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (p_lead_id, 'task_created',
            jsonb_build_object('task_id', v_id, 'title', v_title, 'due_date', p_due_date),
            auth.uid(), 'manual');

    update public.lit_admin_leads set last_activity_at = now(), updated_at = now() where id = p_lead_id;
  end if;

  return jsonb_build_object('ok', true, 'task_id', v_id);
end;
$function$;

-- 3) my_tasks — LEFT JOIN the lead so standalone tasks appear too. The internal/
--    suspended-user filter only applies when a lead is actually linked.
CREATE OR REPLACE FUNCTION public.lit_leadcrm_my_tasks(
  p_assignee uuid DEFAULT NULL,
  p_status text DEFAULT 'open'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'lead_name', case when l.id is null then null else
                       coalesce(nullif(btrim(l.full_name), ''),
                                case when l.email is not null then split_part(l.email::text, '@', 1) else null end,
                                l.company_name, 'Lead') end,
        'lead_company', l.company_name,
        'lead_email', l.email::text
      ) as t,
      coalesce(tk.due_date, date '9999-12-31') as sort_key
    from public.lit_lead_tasks tk
    left join public.lit_admin_leads l on l.id = tk.lead_id
    left join public.profiles ap on ap.id = tk.assignee_user_id
    where (v_assignee is null or tk.assignee_user_id = v_assignee)
      and (
        (v_status = 'open'    and tk.status = 'open') or
        (v_status = 'overdue' and tk.status = 'open' and tk.due_date is not null and tk.due_date < current_date) or
        (v_status = 'done'    and tk.status = 'done') or
        (v_status = 'all')
      )
      -- Only hide internal/suspended users when the task IS linked to a lead.
      and (tk.lead_id is null
        or l.user_id is null
        or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
    order by sort_key
  ) t;

  return jsonb_build_object('ok', true, 'tasks', v_rows);
end;
$function$;

COMMIT;
