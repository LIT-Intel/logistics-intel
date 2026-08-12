-- (2026-08-11, applied to prod via MCP)
-- 1) Job title on invites — copied to org_members.title by the accept
--    flows (accept-workspace-invite / signup-with-invite).
alter table public.org_invites add column if not exists title text;

-- 2) The weekly-nurture floor and meeting-no-show recovery enqueue by
--    EMAIL (trial users, demo invitees, meeting bookers have no
--    lit_leads row). The dispatcher keys on email; lead_id is lineage
--    metadata, not a dependency.
alter table public.lit_lead_sequence_queue alter column lead_id drop not null;
