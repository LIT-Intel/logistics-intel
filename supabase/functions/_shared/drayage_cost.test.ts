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
