// supabase/functions/_shared/hapag_client.ts
//
// Hapag-Lloyd DCSA T&T 2.0 client. OAuth2 client-credentials.

import type { TrackingEvent } from "./maersk_client.ts";
export type { TrackingEvent };

const TOKEN_URL = "https://api.hlag.com/oauth2/token";
const EVENTS_URL = "https://api.hlag.com/track-trace/v2/events";

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getHapagToken(env: {
  HAPAG_CLIENT_ID: string;
  HAPAG_CLIENT_SECRET: string;
}): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const basic = btoa(`${env.HAPAG_CLIENT_ID}:${env.HAPAG_CLIENT_SECRET}`);
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!resp.ok) throw new Error(`hapag_token_${resp.status}: ${await resp.text().catch(() => "")}`);
  const json = await resp.json();
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return tokenCache.token;
}

export async function fetchHapagEvents(args: {
  bolNumber: string;
  env: { HAPAG_CLIENT_ID: string; HAPAG_CLIENT_SECRET: string };
}): Promise<{ ok: boolean; events: TrackingEvent[]; error?: string }> {
  try {
    const token = await getHapagToken(args.env);
    const url = new URL(EVENTS_URL);
    url.searchParams.set("transportDocumentReference", args.bolNumber);
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (resp.status === 404) return { ok: true, events: [] };
    if (!resp.ok) return { ok: false, events: [], error: `hapag_${resp.status}` };
    const body = await resp.json();
    return { ok: true, events: extractEventsFromHapagResponse(body) };
  } catch (err) {
    return { ok: false, events: [], error: String(err) };
  }
}

export function extractEventsFromHapagResponse(body: any): TrackingEvent[] {
  const events = Array.isArray(body?.events) ? body.events : [];
  const out: TrackingEvent[] = [];
  for (const e of events) {
    const code =
      e.transportEventTypeCode ||
      e.equipmentEventTypeCode ||
      e.shipmentEventTypeCode ||
      "";
    if (!code || !e.eventDateTime) continue;
    out.push({
      event_code: String(code),
      event_classifier: e.eventClassifierCode || null,
      event_timestamp: e.eventDateTime,
      location_name: e.eventLocation?.locationName || null,
      location_unloc: e.eventLocation?.UNLocationCode || null,
      vessel_name: e.vesselName || null,
      voyage_number: e.carrierExportVoyageNumber || e.carrierVoyageNumber || null,
      container_number: e.equipmentReference || null,
      raw: e,
    });
  }
  return out;
}
