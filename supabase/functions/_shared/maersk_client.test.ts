// supabase/functions/_shared/maersk_client.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractEventsFromMaerskResponse } from "./maersk_client.ts";

Deno.test("extractEventsFromMaerskResponse — empty", () => {
  assertEquals(extractEventsFromMaerskResponse({}), []);
  assertEquals(extractEventsFromMaerskResponse({ events: [] }), []);
});

Deno.test("extractEventsFromMaerskResponse — maps DCSA events", () => {
  const resp = {
    events: [
      {
        eventType: "TRANSPORT",
        eventDateTime: "2026-05-10T12:00:00Z",
        eventClassifierCode: "ACT",
        transportEventTypeCode: "DEPA",
        eventLocation: { locationName: "Shanghai", UNLocationCode: "CNSHA" },
        vesselName: "MAERSK SEMARANG",
        carrierVoyageNumber: "203E",
      },
      {
        eventType: "EQUIPMENT",
        eventDateTime: "2026-05-25T08:00:00Z",
        eventClassifierCode: "EST",
        equipmentEventTypeCode: "DISC",
        eventLocation: { locationName: "Long Beach", UNLocationCode: "USLGB" },
        equipmentReference: "MSKU7654321",
      },
    ],
  };
  const out = extractEventsFromMaerskResponse(resp);
  assertEquals(out.length, 2);
  assertEquals(out[0].event_code, "DEPA");
  assertEquals(out[0].event_classifier, "ACT");
  assertEquals(out[0].location_unloc, "CNSHA");
  assertEquals(out[1].event_code, "DISC");
  assertEquals(out[1].container_number, "MSKU7654321");
});
