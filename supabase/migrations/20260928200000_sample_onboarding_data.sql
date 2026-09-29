-- Onboarding sample data: tagged example rows a new org sees by default so
-- every surface (Saved companies, Pipeline, Campaigns, Tasks) has a live
-- example. Tagged is_sample → clearly examples, dismissible, excluded from
-- real analytics; sample campaigns stay status='draft' (never send).
-- Applied to prod via MCP same day.
alter table lit_saved_companies add column if not exists is_sample boolean not null default false;
alter table lit_deals           add column if not exists is_sample boolean not null default false;
alter table lit_campaigns        add column if not exists is_sample boolean not null default false;
alter table lit_tasks            add column if not exists is_sample boolean not null default false;
alter table organizations        add column if not exists sample_seeded_at timestamptz;
notify pgrst, 'reload schema';
