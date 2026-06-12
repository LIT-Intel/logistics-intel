-- Sub-project J.2: step-level time-of-day + weekday-only scheduling.
--
-- Lets a step fire at a specific local time (e.g. "9 AM in the campaign's
-- send_timezone") regardless of the cumulative delay arithmetic, and
-- optionally skip weekends.
--
-- Backwards-compat: both columns default to NULL/false so existing
-- campaigns keep the prior delay-based behavior bit-for-bit.

ALTER TABLE lit_campaign_steps
  ADD COLUMN IF NOT EXISTS time_of_day_local time NULL,
  ADD COLUMN IF NOT EXISTS weekdays_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lit_campaign_steps.time_of_day_local IS
  'When set, overrides the delay-based fire time — the step fires at this local time on the day computed from delay_days. Interpreted in lit_campaigns.send_timezone.';

COMMENT ON COLUMN lit_campaign_steps.weekdays_only IS
  'When true, if the computed fire time falls on a Saturday or Sunday, defer to the next Monday at the same time-of-day.';
