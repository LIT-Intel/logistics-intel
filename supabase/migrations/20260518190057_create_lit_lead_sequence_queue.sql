-- Drip-sequence queue for inbound marketing-site leads.
--
-- Producer:  marketing/app/api/leads/resend/route.ts — enqueues one row
--            per (lead, sequence_step) at lead-capture time, with
--            `send_at = now() + delayHours * interval '1 hour'`.
-- Consumer:  the sequence-dispatcher cron (parallel worker) drains rows
--            where send_at <= now() AND sent_at IS NULL AND failed_at
--            IS NULL, sends via Resend, then stamps sent_at/failed_at.
--
-- The (lead_id, sequence_key, step) unique constraint guarantees the
-- queue stays idempotent — re-running the producer can't double-enqueue.

create table if not exists public.lit_lead_sequence_queue (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lit_leads(id) on delete cascade,
  email text not null,
  sequence_key text not null,
  step int not null,
  send_at timestamptz not null,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  template_id text,
  subject text,
  source text,
  offer text,
  created_at timestamptz not null default now(),
  unique (lead_id, sequence_key, step)
);

-- Partial index keeps the dispatcher's "what's due?" query cheap even
-- as the table grows — it only covers rows still waiting to send.
create index if not exists idx_lit_lead_sequence_queue_pending
  on public.lit_lead_sequence_queue (send_at)
  where sent_at is null and failed_at is null;

alter table public.lit_lead_sequence_queue enable row level security;

-- Service role only — neither the marketing site (anon) nor logged-in
-- app users should ever touch this table directly.
create policy "service role can manage sequence queue"
  on public.lit_lead_sequence_queue
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
