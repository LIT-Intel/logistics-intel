-- Unipile LinkedIn delivery layer.
--
-- Extends the existing campaign + Lead CRM systems without creating a second
-- CRM.  Drafts are always human-approved before the deterministic dispatcher
-- can call Unipile.  Customer campaign data stays org-scoped; the internal
-- Lead CRM path is additionally gated by is_lead_crm_member().

begin;

create table if not exists public.lit_unipile_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  unipile_account_id text not null unique,
  provider text not null default 'LINKEDIN' check (provider = 'LINKEDIN'),
  display_name text,
  email text,
  status text not null default 'CONNECTING'
    check (status in ('CONNECTING','OK','CREDENTIALS','ERROR','STOPPED','DELETED')),
  use_for_campaigns boolean not null default true,
  use_for_lead_crm boolean not null default false,
  daily_invite_cap integer not null default 20 check (daily_invite_cap between 1 and 100),
  daily_message_cap integer not null default 40 check (daily_message_cap between 1 and 150),
  connected_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lit_unipile_accounts_org_status_idx
  on public.lit_unipile_accounts (org_id, status);

create table if not exists public.lit_unipile_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('campaigns','lead_crm')),
  reconnect_account_id uuid references public.lit_unipile_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lit_linkedin_outreach_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  approved_by uuid references auth.users(id) on delete set null,
  unipile_account_id uuid references public.lit_unipile_accounts(id) on delete restrict,
  lead_id uuid references public.lit_admin_leads(id) on delete cascade,
  campaign_id uuid references public.lit_campaigns(id) on delete cascade,
  campaign_step_id uuid references public.lit_campaign_steps(id) on delete set null,
  campaign_contact_id uuid references public.lit_campaign_contacts(id) on delete cascade,
  contact_id uuid references public.lit_contacts(id) on delete set null,
  action_type text not null check (action_type in ('invite','message','reply')),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','sending','sent','failed','cancelled','replied')),
  recipient_name text,
  recipient_linkedin_url text not null,
  recipient_provider_id text,
  provider_chat_id text,
  message text not null,
  agent_version text,
  agent_rationale text,
  idempotency_key text not null unique,
  scheduled_for timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  provider_event_id text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lead_id is not null)::int + (campaign_contact_id is not null)::int >= 1)
);

create index if not exists lit_linkedin_actions_org_status_schedule_idx
  on public.lit_linkedin_outreach_actions (org_id, status, scheduled_for);
create index if not exists lit_linkedin_actions_lead_idx
  on public.lit_linkedin_outreach_actions (lead_id, created_at desc)
  where lead_id is not null;
create index if not exists lit_linkedin_actions_campaign_idx
  on public.lit_linkedin_outreach_actions (campaign_id, created_at desc)
  where campaign_id is not null;

create table if not exists public.lit_linkedin_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.lit_unipile_accounts(id) on delete cascade,
  provider_chat_id text not null,
  lead_id uuid references public.lit_admin_leads(id) on delete set null,
  campaign_id uuid references public.lit_campaigns(id) on delete set null,
  contact_id uuid references public.lit_contacts(id) on delete set null,
  subject text,
  participants jsonb not null default '[]'::jsonb,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_chat_id)
);

create table if not exists public.lit_linkedin_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.lit_linkedin_threads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.lit_unipile_accounts(id) on delete cascade,
  provider_message_id text not null,
  direction text not null check (direction in ('inbound','outbound')),
  sender_provider_id text,
  body_text text,
  message_date timestamptz,
  action_id uuid references public.lit_linkedin_outreach_actions(id) on delete set null,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, provider_message_id)
);

create index if not exists lit_linkedin_threads_org_recent_idx
  on public.lit_linkedin_threads (org_id, last_message_at desc nulls last);
create index if not exists lit_linkedin_messages_thread_date_idx
  on public.lit_linkedin_messages (thread_id, message_date asc nulls last);

create table if not exists public.lit_unipile_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text,
  account_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

alter table public.lit_campaign_contacts
  add column if not exists linkedin_provider_id text;

alter table public.lit_admin_leads
  add column if not exists linkedin_url text;

create or replace function public.lit_leadcrm_primary_linkedin(
  p_lead_id uuid,
  p_contact_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_url text;
  v_company_id uuid;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  select linkedin_url, company_id into v_url, v_company_id
  from public.lit_admin_leads where id = p_lead_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if p_contact_id is not null then
    select c.linkedin_url into v_url
    from public.lit_contacts c
    where c.id = p_contact_id
      and (v_company_id is null or c.company_id = v_company_id);
    if v_url is not null then
      update public.lit_admin_leads set linkedin_url = v_url, updated_at = now() where id = p_lead_id;
    end if;
  end if;

  if v_url is null and v_company_id is not null then
    select c.linkedin_url into v_url
    from public.lit_contacts c
    join public.lit_saved_contacts sc on sc.contact_id = c.id
    where c.company_id = v_company_id and c.linkedin_url is not null
    order by sc.created_at desc limit 1;
  end if;
  return jsonb_build_object('ok', true, 'linkedin_url', v_url);
end;
$$;

revoke all on function public.lit_leadcrm_primary_linkedin(uuid,uuid) from public;
grant execute on function public.lit_leadcrm_primary_linkedin(uuid,uuid) to authenticated;

alter table public.lit_unipile_accounts enable row level security;
alter table public.lit_unipile_auth_sessions enable row level security;
alter table public.lit_linkedin_outreach_actions enable row level security;
alter table public.lit_linkedin_threads enable row level security;
alter table public.lit_linkedin_messages enable row level security;
alter table public.lit_unipile_webhook_events enable row level security;

drop policy if exists lit_unipile_accounts_select on public.lit_unipile_accounts;
create policy lit_unipile_accounts_select on public.lit_unipile_accounts for select using (
  exists (select 1 from public.org_members om
          where om.org_id = lit_unipile_accounts.org_id
            and om.user_id = auth.uid() and om.status = 'active')
  or public.is_platform_admin(auth.uid())
);

drop policy if exists lit_unipile_accounts_write on public.lit_unipile_accounts;
create policy lit_unipile_accounts_write on public.lit_unipile_accounts for update using (
  owner_user_id = auth.uid()
  or exists (select 1 from public.org_members om
             where om.org_id = lit_unipile_accounts.org_id
               and om.user_id = auth.uid() and om.status = 'active'
               and om.role in ('owner','admin'))
  or public.is_platform_admin(auth.uid())
);

drop policy if exists lit_unipile_auth_sessions_none on public.lit_unipile_auth_sessions;
create policy lit_unipile_auth_sessions_none on public.lit_unipile_auth_sessions
  for select using (false);

drop policy if exists lit_linkedin_actions_select on public.lit_linkedin_outreach_actions;
create policy lit_linkedin_actions_select on public.lit_linkedin_outreach_actions for select using (
  (lead_id is not null and public.is_lead_crm_member(auth.uid()))
  or exists (select 1 from public.org_members om
             where om.org_id = lit_linkedin_outreach_actions.org_id
               and om.user_id = auth.uid() and om.status = 'active')
  or public.is_platform_admin(auth.uid())
);

drop policy if exists lit_linkedin_threads_select on public.lit_linkedin_threads;
create policy lit_linkedin_threads_select on public.lit_linkedin_threads for select using (
  (lead_id is not null and public.is_lead_crm_member(auth.uid()))
  or exists (select 1 from public.org_members om
             where om.org_id = lit_linkedin_threads.org_id
               and om.user_id = auth.uid() and om.status = 'active')
  or public.is_platform_admin(auth.uid())
);

drop policy if exists lit_linkedin_messages_select on public.lit_linkedin_messages;
create policy lit_linkedin_messages_select on public.lit_linkedin_messages for select using (
  exists (select 1 from public.lit_linkedin_threads t
          where t.id = lit_linkedin_messages.thread_id
            and ((t.lead_id is not null and public.is_lead_crm_member(auth.uid()))
              or exists (select 1 from public.org_members om
                         where om.org_id = t.org_id and om.user_id = auth.uid()
                           and om.status = 'active')
              or public.is_platform_admin(auth.uid())))
);

revoke all on public.lit_unipile_auth_sessions from anon, authenticated;
revoke all on public.lit_unipile_webhook_events from anon, authenticated;
grant select on public.lit_unipile_accounts, public.lit_linkedin_outreach_actions,
  public.lit_linkedin_threads, public.lit_linkedin_messages to authenticated;

comment on table public.lit_linkedin_outreach_actions is
  'Human-approved LinkedIn invitations/messages drafted by the outreach agent and dispatched through Unipile with idempotency and per-account caps.';

commit;
