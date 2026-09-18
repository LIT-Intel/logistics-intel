// Lightweight funnel instrumentation.
//
// Fire-and-forget writes to `lit_activity_events` (schema: user_id, event_type,
// metadata jsonb). Never awaited, never surfaced — a failed insert (RLS,
// network) must never break the user flow. Mirrors the proven pattern in
// pages/Search.tsx.
//
// Why this exists (funnel audit 2026-09-18): the app had ZERO instrumentation
// for buying-intent surfaces — we could not answer "who viewed billing / saw
// the upgrade wall / clicked upgrade". Every event here feeds the admin Users
// page and conversion analysis.
//
// Canonical event_types:
//   billing_viewed        — opened the in-app billing page
//   pricing_viewed        — opened the in-app pricing page
//   upgrade_modal_shown   — the LIMIT_EXCEEDED / plan-gate modal rendered
//   upgrade_clicked       — clicked through to plans from the modal

import { supabase } from "@/lib/supabase";

export type TrackEvent =
  | "billing_viewed"
  | "pricing_viewed"
  | "upgrade_modal_shown"
  | "upgrade_clicked";

export function trackEvent(
  eventType: TrackEvent | string,
  metadata: Record<string, unknown> = {},
): void {
  try {
    void supabase.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) return; // only log authenticated in-app intent
      void supabase
        .from("lit_activity_events")
        .insert({ user_id: userId, event_type: eventType, metadata })
        .then(
          () => undefined,
          () => undefined,
        );
    }, () => undefined);
  } catch {
    /* instrumentation must never throw into a user flow */
  }
}
