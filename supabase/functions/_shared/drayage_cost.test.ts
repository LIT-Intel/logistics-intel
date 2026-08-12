// supabase/functions/_shared/drayage_cost.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { estimateDrayageCost, normalizeContainerType } from "./drayage_cost.ts";

Deno.test("normalizeContainerType", () => {
  assertEquals(normalizeContainerType("40HC"), "40HC");
  assertEquals(normalizeContainerType("40' HC"), "40HC");
  assertEquals(normalizeContainerType("20ft"), "20FT");
  assertEquals(normalizeContainerType("LCL"), "LCL");
  assertEquals(normalizeContainerType(""), "40FT"); // default
  assertEquals(normalizeContainerType(undefined), "40FT");
});

Deno.test("estimateDrayageCost — LA/LB to Chicago, 2x 40HC", () => {
  const { cost, low, high } = estimateDrayageCost({
    pod_unloc: "USLGB",
    dest_city: "Chicago",
    dest_state: "IL",
    container_count: 2,
    container_type: "40HC",
    miles: 2015,
  });
  // sanity: should be in $25k-45k range for cross-country 2x40HC
  assert(cost > 20000 && cost < 50000, `cost=${cost}`);
  assertEquals(low, Math.round(cost * 0.75));
  assertEquals(high, Math.round(cost * 1.25));
});

Deno.test("estimateDrayageCost — local move uses floor", () => {
  const { cost } = estimateDrayageCost({
    pod_unloc: "USLAX",
    dest_city: "Long Beach",
    dest_state: "CA",
    container_count: 1,
    container_type: "40FT",
    miles: 12,
  });
  assert(cost >= 450, `cost=${cost} should be >= floor 450`);
});

Deno.test("estimateDrayageCost — LCL factor reduces cost", () => {
  const fcl = estimateDrayageCost({
    pod_unloc: "USNYC", dest_city: "Atlanta", dest_state: "GA",
    container_count: 1, container_type: "40FT", miles: 870,
  });
  const lcl = estimateDrayageCost({
    pod_unloc: "USNYC", dest_city: "Atlanta", dest_state: "GA",
    container_count: 1, container_type: "LCL", miles: 870,
  });
  assert(lcl.cost < fcl.cost, `lcl ${lcl.cost} should be < fcl ${fcl.cost}`);
});

Deno.test("estimateDrayageCost — diesel-indexed fuel surcharge (v2)", () => {
  const base = {
    pod_unloc: "USLGB", dest_city: "Chicago", dest_state: "IL",
    container_count: 1, container_type: "40FT" as const, miles: 2015,
  };
  const v1 = estimateDrayageCost(base);
  assertEquals(v1.formula_version, "v1"); // no diesel price → flat 22%

  const v2 = estimateDrayageCost({ ...base, diesel_usd_gal: 5.257 });
  assertEquals(v2.formula_version, "v2");
  // At $5.257/gal: (5.257 − 1.20) / 6.0 ≈ $0.676/mi — close to the legacy
  // 22% × $3.15/mi ≈ $0.693/mi, so v2 should land within ~10% of v1.
  assert(
    Math.abs(v2.cost - v1.cost) / v1.cost < 0.1,
    `v2=${v2.cost} v1=${v1.cost} should be within 10%`,
  );

  // Diesel at/below the $1.20 peg → zero fuel surcharge, still v2.
  const pegged = estimateDrayageCost({ ...base, diesel_usd_gal: 1.2 });
  assertEquals(pegged.formula_version, "v2");
  assert(pegged.cost < v2.cost, `pegged ${pegged.cost} should be < v2 ${v2.cost}`);
});
