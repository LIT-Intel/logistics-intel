-- Add dest_zip to lit_unified_shipments so the Pulse LIVE "Final Dest" column
-- can show "City, ST 98109" format. Parsed from ImportYeti Consignee_Address.
ALTER TABLE public.lit_unified_shipments ADD COLUMN IF NOT EXISTS dest_zip text;
