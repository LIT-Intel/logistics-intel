-- QA round 2 (2026-09-28): applied to prod via MCP same day.
-- Item 1: platform admins could SELECT campaigns but not DELETE/UPDATE.
drop policy if exists lit_campaigns_delete on lit_campaigns;
create policy lit_campaigns_delete on lit_campaigns for delete using (
  auth.uid() = user_id
  or exists (select 1 from org_members om where om.org_id = lit_campaigns.org_id
             and om.user_id = auth.uid() and om.role = any(array['owner','admin']) and om.status = 'active')
  or exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
);
drop policy if exists lit_campaigns_update on lit_campaigns;
create policy lit_campaigns_update on lit_campaigns for update using (
  auth.uid() = user_id
  or exists (select 1 from org_members om where om.org_id = lit_campaigns.org_id
             and om.user_id = auth.uid() and om.role = any(array['owner','admin']) and om.status = 'active')
  or exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
);
-- Item 7: white-label branding (Growth/Scale/Enterprise).
alter table organizations
  add column if not exists white_label_enabled boolean not null default false,
  add column if not exists brand_name text;
-- Item 3: org-level sending rules the dispatcher honors.
alter table organizations
  add column if not exists sending_rules jsonb not null default
    '{"daily_cap_enabled":false,"daily_cap":80,"rampup_enabled":false,"autopause_bounce_enabled":false,"bounce_threshold":3,"random_delay_enabled":false,"skip_holidays_enabled":false}'::jsonb;
-- (from prior round, kept for a clean replay) calendar link + saved-company archive.
alter table profiles add column if not exists calendar_url text;
alter table lit_saved_companies add column if not exists archived_at timestamptz;
notify pgrst, 'reload schema';
