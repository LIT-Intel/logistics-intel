-- CRM — replace the deal SERVICE TYPE option set with the freight-broker set.
--
-- CEO ask (2026-08-14): the earlier ocean/air/truck/rail/drayage/broker/
-- domestic/intermodal/other list (migration 20260814200000) is replaced by the
-- freight-broker mode set:
--   dry_van, flat_bed, reefer, straight_truck, hot_shot, sprinter_van,
--   drayage, intermodal, ocean, air, other.
--
-- Steps:
--   1. Drop the old service_type CHECK constraint.
--   2. Migrate any legacy values so nothing violates the new set:
--        truck    -> dry_van
--        rail     -> intermodal
--        broker   -> other
--        domestic -> other
--        (drayage/intermodal/ocean/air/other already valid — kept)
--        any other non-matching, non-null value -> other
--        NULL stays NULL (unspecified).
--   3. Add the new CHECK constraint allowing exactly the 11 canonical values
--      (nullable = unspecified).
--
-- Idempotent-safe: constraint drop/add are guarded. Applied to prod
-- jkmrfiaefxwgbvftohrb via Supabase MCP; mirrored to the migrations dir so
-- `supabase db push` treats it as already-applied.

BEGIN;

-- 1. Drop the old constraint if present.
ALTER TABLE public.lit_deals DROP CONSTRAINT IF EXISTS lit_deals_service_type_check;

-- 2. Migrate legacy values to the new canonical set.
UPDATE public.lit_deals SET service_type = 'dry_van'    WHERE service_type = 'truck';
UPDATE public.lit_deals SET service_type = 'intermodal' WHERE service_type = 'rail';
UPDATE public.lit_deals SET service_type = 'other'      WHERE service_type IN ('broker','domestic');
-- Any remaining non-null value not in the new canonical set -> 'other'.
UPDATE public.lit_deals
   SET service_type = 'other'
 WHERE service_type IS NOT NULL
   AND service_type NOT IN (
     'dry_van','flat_bed','reefer','straight_truck','hot_shot','sprinter_van',
     'drayage','intermodal','ocean','air','other'
   );

-- 3. Add the new CHECK constraint (nullable = unspecified).
ALTER TABLE public.lit_deals
  ADD CONSTRAINT lit_deals_service_type_check
  CHECK (service_type IS NULL OR service_type IN (
    'dry_van','flat_bed','reefer','straight_truck','hot_shot','sprinter_van',
    'drayage','intermodal','ocean','air','other'
  ));

COMMIT;
