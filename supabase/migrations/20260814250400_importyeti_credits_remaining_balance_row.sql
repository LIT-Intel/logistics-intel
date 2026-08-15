-- Phase 2A (data-economics): ensure the ImportYeti balance row exists with canonical shape
-- {"credits_remaining": <numeric>}. Do NOT overwrite the existing (stale) value;
-- Phase 2B gateway will update it from creditsRemaining on every provider call.
insert into public.lit_internal_meta (meta_key, meta_value)
values ('importyeti_credits_remaining', '{"credits_remaining": 0}'::jsonb)
on conflict (meta_key) do nothing;
