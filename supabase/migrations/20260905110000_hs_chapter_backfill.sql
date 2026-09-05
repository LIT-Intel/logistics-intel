-- HS-chapter backfill: only 25% of BOLs carry an HS code, but 99.3% carry a
-- product description. Classify descriptions to the 2-DIGIT HS chapter via a
-- curated keyword map (grounded in this dataset's actual vocabulary: wood,
-- steel, cotton, automotive, furniture, ceramic, knit/woven, axle, frozen…).
--
-- Honesty rules:
--   * We only ever assign a 2-digit CHAPTER, never a fabricated 6-digit code.
--   * hs_chapter_source records provenance: 'bol' (from the real HS code) vs
--     'keyword' (classified). UI copy should say "commodity (classified)".
--   * Patterns are priority-ordered so specific beats generic (steel coil→72
--     before steel→73; knit→61 before cotton→52).

CREATE TABLE IF NOT EXISTS public.lit_hs_chapters (
  chapter text PRIMARY KEY,
  label   text NOT NULL
);

INSERT INTO public.lit_hs_chapters (chapter, label) VALUES
  ('03','Seafood'), ('08','Fruit & Nuts'), ('09','Coffee, Tea & Spices'),
  ('16','Prepared Meat & Seafood'), ('20','Prepared Fruit & Veg'), ('21','Misc. Food Preparations'),
  ('22','Beverages'), ('33','Cosmetics & Toiletries'), ('34','Soaps, Waxes & Candles'),
  ('39','Plastics'), ('40','Rubber & Tires'), ('42','Bags & Leather Goods'),
  ('44','Wood Products'), ('48','Paper & Packaging'), ('52','Cotton & Fabrics'),
  ('54','Synthetic Fabrics'), ('61','Apparel (Knit)'), ('62','Apparel (Woven)'),
  ('63','Home Textiles'), ('64','Footwear'), ('68','Stone & Cement Articles'),
  ('69','Ceramics & Tile'), ('70','Glass & Glassware'), ('72','Iron & Steel (Mill)'),
  ('73','Steel Articles'), ('76','Aluminum'), ('82','Tools & Cutlery'),
  ('83','Metal Hardware'), ('84','Machinery'), ('85','Electronics & Electrical'),
  ('87','Vehicles & Parts'), ('90','Optical & Medical'), ('94','Furniture & Lighting'),
  ('95','Toys, Games & Sports')
ON CONFLICT (chapter) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lit_hs_keyword_map (
  id       serial PRIMARY KEY,
  priority int  NOT NULL,
  pattern  text NOT NULL,   -- case-insensitive POSIX regex vs product_description
  chapter  text NOT NULL REFERENCES public.lit_hs_chapters(chapter)
);

DELETE FROM public.lit_hs_keyword_map;
INSERT INTO public.lit_hs_keyword_map (priority, pattern, chapter) VALUES
  -- specific → generic
  (10, '\y(frozen\s+)?(shrimp|prawn|tilapia|salmon|squid|crab|seafood|fish\s+fillet)\y', '03'),
  (10, '\y(banana|citrus|orange|mandarin|clementine|grape|avocado|blueberr|pineapple)\y', '08'),
  (10, '\y(coffee|green\s+tea|black\s+tea)\y', '09'),
  (12, '\y(wine|beer|juice|beverage|mineral water)\y', '22'),
  (12, '\y(candle|wax\s+melt)\y', '34'),
  (12, '\y(cosmetic|shampoo|lotion|skincare|toiletr)\y', '33'),
  (14, '\y(tire|tyre)s?\y', '40'),
  (16, '\y(handbag|backpack|luggage|suitcase|tote\s+bag|leather\s+(bag|wallet|belt))\y', '42'),
  (16, '\y(footwear|shoe|sneaker|sandal|boot)s?\y', '64'),
  (16, '\y(toy|puzzle|board\s+game|sporting\s+goods|fitness\s+equipment)\y', '95'),
  (18, '\y(towel|bedding|bed\s+sheet|curtain|blanket|duvet|pillowcase|cushion\s+cover)\y', '63'),
  (20, '\yknit(ted)?\y', '61'),
  (22, '\y(woven|denim)\y.*\y(garment|apparel|shirt|trouser|pant|dress|jacket|blouse)\y', '62'),
  (22, '\y(garment|apparel|t-?shirt|trouser|jeans|jacket|blouse|dress(es)?|sweater|hoodie|mens\s+wear|womens\s+wear)\y', '62'),
  (26, '\y(cotton\s+(yarn|fabric)|100%?\s*cotton\s+fabric|greige)\y', '52'),
  (26, '\y(polyester\s+(fabric|yarn)|nylon\s+fabric|woven\s+fabric)\y', '54'),
  (28, '\y(furniture|sofa|couch|mattress|recliner|dining\s+(table|chair)|coffee\s+table|nightstand|dresser|wardrobe|bookcase|bed\s+frame|office\s+chair|chairs?|desk|lamp|lighting\s+fixture)\y', '94'),
  (30, '\y(ceramic|porcelain|tile)s?\y', '69'),
  (30, '\y(granite|marble|quartz\s+(slab|surface)|cement\s+board|stone\s+slab)\y', '68'),
  (30, '\y(glassware|glass\s+(bottle|jar|vase))\y', '70'),
  (32, '\y(plywood|lumber|timber|mdf|veneer|wood(en)?)\y', '44'),
  (34, '\y(paper|cardboard|corrugated|kraft)\y', '48'),
  (36, '\y(steel\s+(coil|sheet|plate|strip|billet|wire\s+rod)|hot\s+rolled|cold\s+rolled|stainless\s+coil)\y', '72'),
  (38, '\y(steel|iron\s+(pipe|fitting|casting))\y', '73'),
  (38, '\y(alumin(i)?um)\y', '76'),
  (40, '\y(hand\s+tool|wrench|plier|drill\s+bit|cutlery|scissor)\y', '82'),
  (40, '\y(hinge|lock(set)?|padlock|door\s+handle|bracket|fastener|screw|bolt|nut)s?\y', '83'),
  (42, '\y(axle|bumper|brake|radiator|auto(motive)?\s+part|car\s+part|vehicle|chassis|seltos|steering|suspension|exhaust)\y', '87'),
  (44, '\y(machin(e|ery)|engine|pump|compressor|excavator|forklift|bearing|gearbox|conveyor)\y', '84'),
  (46, '\y(electric(al)?|electronic|battery|batteries|led|solar\s+panel|inverter|wire\s+harness|transformer|refrigerator|air\s+condition|appliance|television|monitor|laptop)\y', '85'),
  (48, '\y(optical|medical\s+(device|instrument)|thermometer|diagnostic)\y', '90'),
  (50, '\y(plastic|polyethylene|polypropylene|pvc|resin|acrylic)\y', '39'),
  (52, '\y(sauce|noodle|snack|confectioner|biscuit|cookie|instant\s+food)\y', '21');

-- Columns on the shipments table
ALTER TABLE public.lit_unified_shipments
  ADD COLUMN IF NOT EXISTS hs_chapter        text,
  ADD COLUMN IF NOT EXISTS hs_chapter_source text;

-- Classifier: first matching pattern by priority, else null.
CREATE OR REPLACE FUNCTION public.lit_classify_hs_chapter(p_desc text)
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT m.chapter FROM public.lit_hs_keyword_map m
  WHERE p_desc ~* m.pattern
  ORDER BY m.priority, m.id LIMIT 1;
$$;

-- Backfill: real HS code wins ('bol'); else classify the description ('keyword').
UPDATE public.lit_unified_shipments SET
  hs_chapter = left(regexp_replace(hs_code, '[^0-9]', '', 'g'), 2),
  hs_chapter_source = 'bol'
WHERE hs_code IS NOT NULL AND hs_code <> ''
  AND left(regexp_replace(hs_code, '[^0-9]', '', 'g'), 2) ~ '^[0-9]{2}$'
  AND hs_chapter IS NULL;

UPDATE public.lit_unified_shipments SET
  hs_chapter = public.lit_classify_hs_chapter(product_description),
  hs_chapter_source = 'keyword'
WHERE hs_chapter IS NULL
  AND product_description IS NOT NULL
  AND public.lit_classify_hs_chapter(product_description) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lus_hs_chapter
  ON public.lit_unified_shipments (hs_chapter) WHERE hs_chapter IS NOT NULL;

-- Keep new ingests classified: extend the hidden-field trigger.
CREATE OR REPLACE FUNCTION public.lus_extract_hidden_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.raw_payload IS NOT NULL THEN
    NEW.consignee_address    := COALESCE(NEW.consignee_address,    NULLIF(NEW.raw_payload->>'Consignee_Address',''));
    NEW.shipper_address      := COALESCE(NEW.shipper_address,      NULLIF(NEW.raw_payload->>'Shipper_Address',''));
    NEW.notify_party_name    := COALESCE(NEW.notify_party_name,    NULLIF(NEW.raw_payload->>'Notify_Party_Name',''));
    NEW.notify_party_address := COALESCE(NEW.notify_party_address, NULLIF(NEW.raw_payload->>'Notify_Party_Address',''));
    NEW.house_bol            := COALESCE(NEW.house_bol,            NULLIF(NEW.raw_payload->>'house_bill_of_lading',''));
    NEW.shipping_route       := COALESCE(NEW.shipping_route,       NULLIF(NEW.raw_payload->>'shipping_route',''));
    NEW.quantity             := COALESCE(NEW.quantity, CASE WHEN NEW.raw_payload->>'Quantity' ~ '^[0-9]+(\.[0-9]+)?$'
                                                            THEN (NEW.raw_payload->>'Quantity')::numeric END);
    NEW.quantity_unit        := COALESCE(NEW.quantity_unit,        NULLIF(NEW.raw_payload->>'Quantity_Unit',''));
  END IF;
  IF NEW.hs_chapter IS NULL THEN
    IF NEW.hs_code IS NOT NULL AND NEW.hs_code <> ''
       AND left(regexp_replace(NEW.hs_code, '[^0-9]', '', 'g'), 2) ~ '^[0-9]{2}$' THEN
      NEW.hs_chapter := left(regexp_replace(NEW.hs_code, '[^0-9]', '', 'g'), 2);
      NEW.hs_chapter_source := 'bol';
    ELSIF NEW.product_description IS NOT NULL THEN
      NEW.hs_chapter := public.lit_classify_hs_chapter(NEW.product_description);
      IF NEW.hs_chapter IS NOT NULL THEN NEW.hs_chapter_source := 'keyword'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lus_extract_hidden_fields ON public.lit_unified_shipments;
CREATE TRIGGER trg_lus_extract_hidden_fields
  BEFORE INSERT OR UPDATE OF raw_payload, hs_code, product_description
  ON public.lit_unified_shipments
  FOR EACH ROW EXECUTE FUNCTION public.lus_extract_hidden_fields();

GRANT SELECT ON public.lit_hs_chapters TO authenticated;
