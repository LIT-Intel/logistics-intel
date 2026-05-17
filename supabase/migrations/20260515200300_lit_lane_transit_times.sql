-- Lane transit time lookup for arrival-window inference.
-- Maps origin_region + dest_region -> median/low/high transit days.
-- Used by pulse-arrival-alerts edge fn to estimate arrival dates from
-- ImportYeti shipmentDate (which lacks ETA/actual arrival).

CREATE TABLE IF NOT EXISTS public.lit_lane_transit_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_region text NOT NULL,        -- 'asia','europe','latam','us-domestic','intra-asia','africa','oceania','middle-east'
  dest_region text NOT NULL,          -- 'us-west','us-east','us-gulf','us-other','europe','asia','latam'
  median_days integer NOT NULL,
  low_days integer NOT NULL,          -- 25th percentile
  high_days integer NOT NULL,         -- 75th percentile
  source text NOT NULL DEFAULT 'industry_avg_2026',
  UNIQUE (origin_region, dest_region)
);

INSERT INTO public.lit_lane_transit_times (origin_region, dest_region, median_days, low_days, high_days) VALUES
  ('asia', 'us-west',   16, 14, 19),
  ('asia', 'us-east',   32, 28, 36),
  ('asia', 'us-gulf',   28, 25, 32),
  ('europe', 'us-east', 12, 10, 14),
  ('europe', 'us-west', 18, 16, 21),
  ('latam', 'us-east',   7,  5, 10),
  ('latam', 'us-gulf',   5,  3,  8),
  ('latam', 'us-west',  10,  7, 13),
  ('intra-asia','intra-asia', 5, 3, 7),
  ('asia','europe',     30, 26, 35),
  ('europe','europe',    4,  2,  6),
  ('africa','us-east',  21, 18, 25),
  ('oceania','us-west', 18, 16, 21),
  ('middle-east','us-east', 25, 22, 28)
ON CONFLICT (origin_region, dest_region) DO NOTHING;

ALTER TABLE public.lit_unified_shipments
  ADD COLUMN IF NOT EXISTS estimated_arrival_date timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_arrival_low timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_arrival_high timestamptz;

CREATE INDEX IF NOT EXISTS idx_lus_estimated_arrival
  ON public.lit_unified_shipments (estimated_arrival_date)
  WHERE tracking_arrival_actual IS NULL;
