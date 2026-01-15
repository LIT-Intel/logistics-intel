/*
  # Drop Old LIT Tables
  
  Drops existing LIT tables to prepare for new schema
*/

-- Drop old tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS lit_campaign_companies CASCADE;
DROP TABLE IF EXISTS lit_campaigns CASCADE;
DROP TABLE IF EXISTS lit_contacts CASCADE;
DROP TABLE IF EXISTS lit_saved_companies CASCADE;
