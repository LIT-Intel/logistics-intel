// supabase/functions/_shared/opportunity_scoring.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  consolidationScore,
  vulnerableScore,
  velocityScore,
  compositeScore,
} from "./opportunity_scoring.ts";

Deno.test("consolidation: single forwarder = 0", () => {
  assertEquals(consolidationScore({ forwarder_count: 1, total_teu_12m: 5000 }), 0);
});

Deno.test("consolidation: many forwarders + big volume = high", () => {
  const s = consolidationScore({ forwarder_count: 4, total_teu_12m: 5000 });
  assert(s > 70, `expected > 70, got ${s}`);
  assert(s <= 100);
});

Deno.test("vulnerable: dominant forwarder + shrinking TEU = high", () => {
  const s = vulnerableScore({
    forwarder_concentration: 0.9,
    recent_6m_teu: 100,
    prior_6m_teu: 500,
  });
  assert(s > 70, `expected > 70, got ${s}`);
});

Deno.test("vulnerable: growing TEU + low concentration = low", () => {
  const s = vulnerableScore({
    forwarder_concentration: 0.3,
    recent_6m_teu: 500,
    prior_6m_teu: 200,
  });
  assert(s < 30, `expected < 30, got ${s}`);
});

Deno.test("velocity: top-quintile TEU + recent = high", () => {
  const s = velocityScore({ percentile_teu: 0.95, days_since_last_shipment: 10 });
  assert(s > 80, `expected > 80, got ${s}`);
});

Deno.test("composite: dominant score wins via the 0.7 weight", () => {
  const s = compositeScore({ consolidation: 0, vulnerable: 100, velocity: 0, defend: 0 });
  assert(s >= 70, `expected >= 70 from 100 * 0.7, got ${s}`);
});
