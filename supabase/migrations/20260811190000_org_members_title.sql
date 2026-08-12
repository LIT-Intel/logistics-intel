-- Job titles on the team roster (2026-08-11). Display identity only —
-- permissions remain role + page_permissions.
alter table public.org_members add column if not exists title text;
comment on column public.org_members.title is
  'Job title shown on the team roster (e.g. "VP of Business Development"). Display identity only — permissions come from role + page_permissions.';
