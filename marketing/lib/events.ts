/**
 * Marketing-site event tracking helper.
 *
 * Single `track(event, props)` call site fires two layers:
 *
 *   1. Plausible custom event (window.plausible — privacy-friendly,
 *      no PII, gets us a public-ish events dashboard automatically).
 *   2. First-party POST to /api/events which inserts a row into
 *      public.lit_marketing_site_events — used by the LIT admin dashboard
 *      to join events to lit_leads (by email) and reason about the
 *      end-to-end funnel without depending on Plausible's API.
 *
 * Both layers are best-effort: failure is swallowed and never thrown.
 * Browser-only (no-ops on the server). Coordinates with the
 * cookie/attribution agent via these sessionStorage key names:
 *
 *   - `lit.session_id`  — random id, lives for the session
 *   - `lit.utm`         — JSON-stringified utm object (utm_source,
 *                         utm_medium, utm_campaign, utm_term, utm_content)
 *   - `lit.referrer`    — first off-site referrer for the session
 *
 * Event taxonomy (also see the README at marketing/components/lead-magnet/):
 *
 *   page_view           — every route change. props: { path }
 *   form_submit         — every lead-magnet form. props: { source, offer? }
 *   cta_click           — Start free / Book a demo / Apply now buttons.
 *                         props: { source, label, href? }
 *   exit_intent_shown   — when the modal fires. props: { offer? }
 *   scroll_depth_75     — passed 75% of page scroll. props: { path }
 *   outbound_click      — link to a different domain. props: { href, label? }
 *   time_on_page_30s    — user stayed 30s on the page. props: { path }
 *
 * Every event automatically carries: path, referrer, utm (jsonb),
 * session_id, user_agent (server-side), and a created_at timestamp.
 */

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, unknown>; callback?: () => void },
    ) => void;
  }
}

const SESSION_KEY = "lit.session_id";
const UTM_KEY = "lit.utm";
const REFERRER_KEY = "lit.referrer";

export type UtmProps = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
};

export type TrackProps = Record<string, string | number | boolean | null | undefined>;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function randomId(): string {
  try {
    // Modern browsers — uuid is cheap and unique enough.
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId(): string {
  if (!isBrowser()) return "";
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function getUtm(): UtmProps {
  if (!isBrowser()) return {};
  // Prefer the cookie agent's sessionStorage stash; fall back to URL
  // params so analytics still works if attribution boot hasn't run.
  try {
    const raw = window.sessionStorage.getItem(UTM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UtmProps;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    /* ignore */
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const utm: UtmProps = {};
    const keys: Array<keyof UtmProps> = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ];
    for (const k of keys) {
      const v = params.get(k)?.trim();
      if (v) utm[k] = v;
    }
    return utm;
  } catch {
    return {};
  }
}

export function getReferrer(): string {
  if (!isBrowser()) return "";
  try {
    const stored = window.sessionStorage.getItem(REFERRER_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  try {
    const ref = document.referrer || "";
    if (ref && !ref.startsWith(window.location.origin)) return ref;
  } catch {
    /* ignore */
  }
  return "";
}

function currentPath(): string {
  if (!isBrowser()) return "";
  try {
    return window.location.pathname + (window.location.search || "");
  } catch {
    return "";
  }
}

function sanitizeProps(props?: TrackProps): Record<string, unknown> {
  if (!props) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      out[k] = v.length > 256 ? v.slice(0, 256) : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Fire a tracking event. Best-effort, never throws.
 *
 * @param event  One of the documented event names (see top of file).
 * @param props  Optional small flat object of string/number/boolean.
 */
export function track(event: string, props?: TrackProps): void {
  if (!isBrowser()) return;
  if (!event || typeof event !== "string") return;

  const cleanProps = sanitizeProps(props);
  const path = (cleanProps.path as string | undefined) ?? currentPath();
  const utm = getUtm();
  const referrer = getReferrer();
  const session_id = getSessionId();

  // 1) Plausible
  try {
    window.plausible?.(event, { props: { ...cleanProps, path } });
  } catch {
    /* ignore */
  }

  // 2) First-party event sink
  try {
    const body = JSON.stringify({
      event_name: event,
      path,
      properties: cleanProps,
      session_id,
      lead_email:
        typeof cleanProps.email === "string" ? cleanProps.email : undefined,
      utm,
      referrer,
    });

    // Prefer sendBeacon when available — survives page unload (useful for
    // form_submit + outbound_click which often race against navigation).
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/events", blob);
      return;
    }

    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}
