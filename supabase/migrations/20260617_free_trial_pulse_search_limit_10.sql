-- Free trial users get 10 Pulse searches (was 5). pulse-search edge fn
-- already gates via check_usage_limit with feature_key='pulse_search';
-- this row drives that gate's threshold. After 10 searches the fn returns
-- LIMIT_EXCEEDED and the Pulse UI shows the upgrade card.
--
-- Applied to prod 2026-06-17 via Supabase MCP. Mirrored here for git parity.

UPDATE public.plans SET pulse_search_limit = 10 WHERE code = 'free_trial';
