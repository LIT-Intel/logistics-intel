-- Pulse Explorer Phase 1 follow-up — V6-rich columns on lit_company_directory.
-- Adds real lat/lng (V6 supplies these for 99.97% of rows, enabling map
-- plotting without coord lookup) and top_forwarders (the Revenue Vessel
-- forwarder concentration data that the original cron used carrier_name as
-- a proxy for; future cron iterations can prefer V6 forwarder data when
-- available).

alter table lit_company_directory
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists top_forwarders jsonb;

-- Spatial query helper — used by pulse-explore viewport filtering in v1.5.
create index if not exists lit_company_directory_lat_lng_idx
  on lit_company_directory (latitude, longitude)
  where latitude is not null and longitude is not null;

comment on column lit_company_directory.latitude is 'V6 latitude (decimal degrees) — enables real map plotting without coord lookup.';
comment on column lit_company_directory.longitude is 'V6 longitude (decimal degrees).';
comment on column lit_company_directory.top_forwarders is 'V6 top 3 forwarders by TEU: jsonb array of { name, teu, percent }.';
