//
// Reduces an ordered list of DCSA TrackingEvent rows into a summary used to
// stamp lit_unified_shipments tracking_* columns. Treat the latest ACT event as
// the "current" status; treat EST DISC as the ETA.

import type { TrackingEvent } from "./maersk_client.ts";

export interface EventSummary {
  eta: string | null;
  arrivalActual: string | null;
  lastEventCode: string | null;
  lastEventAt: string | null;
}

export function summarizeEvents(events: TrackingEvent[]): EventSummary {
  if (!events || events.length === 0) {
    return { eta: null, arrivalActual: null, lastEventCode: null, lastEventAt: null };
  }
  // Sort ascending by timestamp.
  const sorted = [...events].sort((a, b) =>
    new Date(a.event_timestamp).getTime() - new Date(b.event_timestamp).getTime()
  );
  let eta: string | null = null;
  let arrivalActual: string | null = null;
  let lastActEvent: TrackingEvent | null = null;
  for (const e of sorted) {
    if (e.event_code === "DISC") {
      if (e.event_classifier === "ACT") arrivalActual = e.event_timestamp;
      else if (e.event_classifier === "EST" && !arrivalActual) eta = e.event_timestamp;
    }
    if (e.event_classifier === "ACT") lastActEvent = e;
  }
  return {
    eta,
    arrivalActual,
    lastEventCode: lastActEvent?.event_code ?? null,
    lastEventAt: lastActEvent?.event_timestamp ?? null,
  };
}
