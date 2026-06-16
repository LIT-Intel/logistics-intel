import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeV6Row } from "./ingest-v6-csv.ts";

Deno.test("normalizeV6Row maps V6 columns to directory schema", () => {
  const input = {
    Account: "Acme Foods, Inc.",
    Location: "Atlanta, GA, USA",
    Industry: "Food Manufacturing",
    "TEU Vol.": "1,234",
    "Annual Sales": "$45,000,000",
    Vertical: "Food & Bev",
    "Top Dimensions": '[{"origin":"CN","dest":"US","teu":800}]',
    "GP Potential": "120000",
  };
  const out = normalizeV6Row(input);
  assertEquals(out.company_name, "Acme Foods, Inc.");
  assertEquals(out.canonical_name, "acme foods");
  assertEquals(out.city, "Atlanta");
  assertEquals(out.state, "GA");
  assertEquals(out.country, "USA");
  assertEquals(out.industry, "Food Manufacturing");
  assertEquals(out.teu, 1234);
  assertEquals(out.revenue, "45000000");
  assertEquals(out.vertical, "Food & Bev");
  assertEquals(out.top_dimensions, [{ origin: "CN", dest: "US", teu: 800 }]);
  assertEquals(out.gp_potential, 120000);
});

Deno.test("normalizeV6Row handles missing optional fields", () => {
  const out = normalizeV6Row({ Account: "Solo Inc.", Location: "Houston, TX, USA" });
  assertEquals(out.company_name, "Solo Inc.");
  assertEquals(out.vertical, null);
  assertEquals(out.top_dimensions, null);
  assertEquals(out.gp_potential, null);
});
