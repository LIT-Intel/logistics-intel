import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { haversineMiles, normalizeCityKey } from "./osrm_client.ts";

Deno.test("haversineMiles — LA to Chicago", () => {
  const m = haversineMiles(33.74, -118.27, 41.88, -87.63);
  assert(m > 1700 && m < 1900, `expected ~1745, got ${m}`);
});

Deno.test("normalizeCityKey", () => {
  assertEquals(normalizeCityKey("Chicago"), "chicago");
  assertEquals(normalizeCityKey("Long Beach "), "long beach");
  assertEquals(normalizeCityKey("ST. LOUIS"), "st. louis");
});
