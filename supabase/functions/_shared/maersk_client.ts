// supabase/functions/_shared/maersk_client.ts
//
// Maersk Track & Trace Plus client.
// - OAuth2 client-credentials at /customer-identity/oauth/v2/access_token
// - GET /track-and-trace-plus/v3/shipment-events
// - Free tier; treat as ~30 req/min for safety.

const TOKEN_URL = "https://api.maersk.com/customer-identity/oauth/v2/access_token";
const EVENTS_URL = "https://api.maersk.com/track-and-trace-plus/v3/shipment-events";
const SCOPE = "OAUTH:track-and-trace-plus";

let tokenCache: { token: string; expiresAt: number } | null = null;

export interface TrackingEvent {
  event_code: string;
  event_classifier: string | null;
  event_timestamp: string;
  location_name: string | null;
  location_unloc: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  container_number: string | null;
  raw: any;
}

export async function getMaerskToken(env: {
  MAERSK_CLIENT_ID: string;
  MAERSK_CLIENT_SECRET: string;
}): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: SCOPE,
    client_id: env.MAERSK_CLIENT_ID,
    client_secret: env.MAERSK_CLIENT_SECRET,
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) throw new Error(`maersk_token_${resp.status}: ${await resp.text().catch(() => "")}`);
  const json = await resp.json();
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

export async function fetchMaerskEvents(args: {
  bolNumber: string;
  env: { MAERSK_CLIENT_ID: string; MAERSK_CLIENT_SECRET: string };
}): Promise<{ ok: boolean; events: TrackingEvent[]; error?: string }> {
  try {
    const token = await getMaerskToken(args.env);
    const url = new URL(EVENTS_URL);
    url.searchParams.set("transportDocumentReference", args.bolNumber);
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (resp.status === 404) return { ok: true, events: [] };
    if (!resp.ok) return { ok: false, events: [], error: `maersk_${resp.status}` };
    const body = await resp.json();
    return { ok: true, events: extractEventsFromMaerskResponse(body) };
  } catch (err) {
    return { ok: false, events: [], error: String(err) };
  }
}

export function extractEventsFromMaerskResponse(body: any): TrackingEvent[] {
  const events = Array.isArray(body?.events) ? body.events : [];
  const out: TrackingEvent[] = [];
  for (const e of events) {
    const code =
      e.transportEventTypeCode ||
      e.equipmentEventTypeCode ||
      e.shipmentEventTypeCode ||
      e.eventType ||
      "";
    if (!code || !e.eventDateTime) continue;
    out.push({
      event_code: String(code),
      event_classifier: e.eventClassifierCode || null,
      event_timestamp: e.eventDateTime,
      location_name: e.eventLocation?.locationName || null,
      location_unloc: e.eventLocation?.UNLocationCode || null,
      vessel_name: e.vesselName || null,
      voyage_number: e.carrierVoyageNumber || e.exportVoyageNumber || null,
      container_number: e.equipmentReference || null,
      raw: e,
    });
  }
  return out;
}
