-- Phase 4 — Pulse Explorer v1 gated rollout.
-- Adds the pulse_explorer_v1 feature flag to lit_feature_flags so
-- get-entitlements surfaces it to the frontend.
--
-- Default is OFF (false) so existing users don't see the Explore tab
-- until explicitly enabled per-user via lit_feature_flag_overrides.

insert into lit_feature_flags (key, default_enabled, description)
values (
  'pulse_explorer_v1',
  false,
  'Pulse Explorer (V6-style map intel surface). Early-access rollout — flip on per user via lit_feature_flag_overrides.'
)
on conflict (key) do update set
  description = excluded.description;
