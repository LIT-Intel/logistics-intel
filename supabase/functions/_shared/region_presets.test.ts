// supabase/functions/_shared/region_presets.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { expandRegion, REGION_KEYS } from "./region_presets.ts";

Deno.test("southeast expands to expected states", () => {
  const states = expandRegion("southeast");
  assert(states.includes("FL"));
  assert(states.includes("GA"));
  assert(states.includes("TN"));
  assertEquals(states.length, 7);
});

Deno.test("unknown region returns empty list", () => {
  assertEquals(expandRegion("not-a-region"), []);
});

Deno.test("REGION_KEYS is a non-empty list of canonical keys", () => {
  assert(REGION_KEYS.length >= 4);
  assert(REGION_KEYS.includes("southeast"));
  assert(REGION_KEYS.includes("west_coast"));
});
