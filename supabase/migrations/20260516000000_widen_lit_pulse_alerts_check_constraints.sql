-- Widen lit_pulse_alerts CHECK constraints so pulse-arrival-alerts can
-- insert its rows. Prior constraints rejected:
--   alert_type='arrival_window' (function's canonical name; not in old enum)
--   severity='critical'         (function uses for container_count >= 5)
-- Result: 124 candidates per run produced 0 inserts (all silently rejected).

ALTER TABLE public.lit_pulse_alerts
  DROP CONSTRAINT IF EXISTS lit_pulse_alerts_alert_type_check;

ALTER TABLE public.lit_pulse_alerts
  DROP CONSTRAINT IF EXISTS lit_pulse_alerts_severity_check;

ALTER TABLE public.lit_pulse_alerts
  ADD CONSTRAINT lit_pulse_alerts_alert_type_check
    CHECK (alert_type = ANY (ARRAY[
      'volume'::text,
      'shipment'::text,
      'lane'::text,
      'benchmark'::text,
      'baseline'::text,
      'arrival_window'::text
    ]));

ALTER TABLE public.lit_pulse_alerts
  ADD CONSTRAINT lit_pulse_alerts_severity_check
    CHECK (severity = ANY (ARRAY[
      'info'::text,
      'warning'::text,
      'high'::text,
      'critical'::text
    ]));
