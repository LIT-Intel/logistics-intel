-- 20260616162101_pulse_explorer_v6_columns.sql
-- Adds V6 (DSV Sales Explorer V6 / Revenue Vessel) seed columns to lit_company_directory.

alter table lit_company_directory
  add column if not exists vertical text,
  add column if not exists top_dimensions jsonb,
  add column if not exists gp_potential numeric;

comment on column lit_company_directory.vertical is 'V6 vertical taxonomy (broader than industry, e.g. "Food & Bev", "Industrial").';
comment on column lit_company_directory.top_dimensions is 'V6 lanes: jsonb array of { origin_country, dest_country, teu, share }.';
comment on column lit_company_directory.gp_potential is 'V6 gross-profit potential estimate in USD.';

-- Index for vertical filtering (chip / NL search).
create index if not exists lit_company_directory_vertical_idx
  on lit_company_directory (vertical)
  where vertical is not null;
