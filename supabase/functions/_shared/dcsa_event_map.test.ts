import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summarizeEvents } from "./dcsa_event_map.ts";

Deno.test("summarizeEvents — empty", () => {
  const s = summarizeEvents([]);
  assertEquals(s.eta, null);
  assertEquals(s.arrivalActual, null);
  assertEquals(s.lastEventCode, null);
});

Deno.test("summarizeEvents — EST DISC sets ETA", () => {
  const s = summarizeEvents([
    { event_code: "DEPA", event_classifier: "ACT", event_timestamp: "2026-05-01T00:00:00Z" } as any,
    { event_code: "DISC", event_classifier: "EST", event_timestamp: "2026-05-22T14:00:00Z" } as any,
  ]);
  assertEquals(s.eta, "2026-05-22T14:00:00Z");
  assertEquals(s.arrivalActual, null);
  assertEquals(s.lastEventCode, "DEPA");
});

Deno.test("summarizeEvents — ACT DISC sets arrivalActual", () => {
  const s = summarizeEvents([
    { event_code: "DEPA", event_classifier: "ACT", event_timestamp: "2026-05-01T00:00:00Z" } as any,
    { event_code: "DISC", event_classifier: "ACT", event_timestamp: "2026-05-20T14:00:00Z" } as any,
  ]);
  assertEquals(s.arrivalActual, "2026-05-20T14:00:00Z");
  assertEquals(s.lastEventCode, "DISC");
});
