-- QA round 2 item 12: per-lane freight mode on deal line items
-- (FCL/FTL/Air/Drayage/…), independent of the deal-level service_type.
-- Applied to prod via MCP same day.
alter table lit_deal_line_items add column if not exists mode text;
notify pgrst, 'reload schema';
