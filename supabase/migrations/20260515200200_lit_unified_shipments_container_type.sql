ALTER TABLE public.lit_unified_shipments
  ADD COLUMN IF NOT EXISTS container_type text,
  ADD COLUMN IF NOT EXISTS container_type_confidence text
    CHECK (container_type_confidence IN ('high','medium','low') OR container_type_confidence IS NULL);
CREATE INDEX IF NOT EXISTS idx_lus_container_type
  ON public.lit_unified_shipments(container_type) WHERE container_type IS NOT NULL;
