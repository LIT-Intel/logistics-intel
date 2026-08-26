-- Harvey 2.0 contextual Company Profile surface.
-- Separate from harvey_internal_agent so enabling the UI can never enable
-- autonomous outreach. Ships fail-closed.
insert into public.lit_feature_flags
  (key, label, description, scope, global_kill, rollout, owner, metadata)
values
  ('harvey_contextual_copilot', 'Harvey contextual copilot',
   'Grounded Company Profile copilot. Read/draft only; autonomous handoff remains internal Lead CRM only.',
   'global', true, 0, 'product', '{"surface":"company_profile","fail_closed":true}'::jsonb)
on conflict (key) do nothing;
