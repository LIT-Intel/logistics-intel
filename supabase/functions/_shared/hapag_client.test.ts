// supabase/functions/_shared/hapag_client.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractEventsFromHapagResponse } from "./hapag_client.ts";

Deno.test("extractEventsFromHapagResponse — empty", () => {
  assertEquals(extractEventsFromHapagResponse({}), []);
  assertEquals(extractEventsFromHapagResponse({ events: [] }), []);
});

Deno.test("extractEventsFromHapagResponse — DCSA T&T 2.0 events", () => {
  const body = {
    events: [
      {
        eventDateTime: "2026-04-30T22:00:00Z",
        eventClassifierCode: "ACT",
        transportEventTypeCode: "LOAD",
        eventLocation: { locationName: "Hamburg", UNLocationCode: "DEHAM" },
        vesselName: "HAMBURG EXPRESS",
        carrierExportVoyageNumber: "012W",
      },
      {
        eventDateTime: "2026-05-22T14:00:00Z",
        eventClassifierCode: "EST",
        equipmentEventTypeCode: "DISC",
        eventLocation: { locationName: "New York", UNLocationCode: "USNYC" },
        equipmentReference: "HLXU8472100",
      },
    ],
  };
  const out = extractEventsFromHapagResponse(body);
  assertEquals(out.length, 2);
  assertEquals(out[0].event_code, "LOAD");
  assertEquals(out[1].event_code, "DISC");
  assertEquals(out[1].container_number, "HLXU8472100");
});
