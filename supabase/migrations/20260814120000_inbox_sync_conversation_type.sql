-- Inbox sync engine — conversation-type tagging + explicit grants.
--
-- Adds a Monday.com-style `conversation_type` chip to lit_email_threads
-- so the inbox UI can distinguish:
--   'direct'   — an organic thread pulled from the mailbox (no campaign link)
--   'campaign' — a thread that contains a message sent by one of our campaigns
--   'reply'    — a thread where a contact replied to a campaign send
--
-- Also adds explicit table grants that the 20260504 migration omitted (the
-- recurring "grants-missing" bug): without GRANT the anon/authenticated roles
-- can't even reach RLS. Service role bypasses RLS but still needs the grant.

-- ─── conversation_type on threads + messages ──────────────────────────────────
alter table public.lit_email_threads
  add column if not exists conversation_type text not null default 'direct'
    check (conversation_type in ('direct','campaign','reply'));

alter table public.lit_email_messages
  add column if not exists conversation_type text not null default 'direct'
    check (conversation_type in ('direct','campaign','reply'));

create index if not exists lit_email_threads_convtype_idx
  on public.lit_email_threads (user_id, conversation_type);

-- ─── Explicit grants (RLS still applies on top) ───────────────────────────────
grant select, update on public.lit_email_threads to authenticated;
grant select          on public.lit_email_messages to authenticated;
grant all             on public.lit_email_threads  to service_role;
grant all             on public.lit_email_messages to service_role;

-- INSERT policy so a future user-scoped writer path (and defense-in-depth for
-- the service role) is explicit. Threads/messages are written by the sync fn
-- under the service role today, but making the owner insert path explicit keeps
-- the table honest if a client-side optimistic write is ever added.
drop policy if exists lit_email_threads_insert on public.lit_email_threads;
create policy lit_email_threads_insert on public.lit_email_threads
  for insert with check (
    user_id = auth.uid()
    or org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

drop policy if exists lit_email_messages_insert on public.lit_email_messages;
create policy lit_email_messages_insert on public.lit_email_messages
  for insert with check (
    user_id = auth.uid()
    or org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

comment on column public.lit_email_threads.conversation_type is
  'Monday.com-style conversation tag: direct (organic mailbox thread), campaign (contains an outbound campaign send), or reply (a contact replied to a campaign). Set at sync time by sync-inbox.';
