// Notifications API client. Reads + mutates lit_notifications via the
// standard supabase client; RLS limits to rows where user_id =
// auth.uid(). Status transitions are unread -> read -> dismissed.
//
// Notifications fan out from lit_signals automatically (via DB
// trigger), so callers don't have to enqueue manually.

import { supabase } from "@/lib/supabase";

export type NotificationStatus = "unread" | "read" | "dismissed";
export type NotificationSeverity = "low" | "medium" | "high" | "critical";
export type NotificationKind =
  | "signal"
  | "reply"
  | "campaign"
  | "billing"
  | "system"
  | "invite"
  | "enrichment";

export type NotificationRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_url: string | null;
  source_table: string | null;
  source_id: string | null;
  status: NotificationStatus;
  read_at: string | null;
  dismissed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ListNotificationsOptions = {
  limit?: number;
  statuses?: NotificationStatus[];
  kinds?: NotificationKind[];
};

export async function listNotifications(opts: ListNotificationsOptions = {}): Promise<NotificationRow[]> {
  const statuses = opts.statuses ?? ["unread", "read"];
  const limit = opts.limit ?? 50;
  try {
    let q = supabase
      .from("lit_notifications")
      .select(
        "id, user_id, org_id, kind, severity, title, body, cta_label, cta_url, source_table, source_id, status, read_at, dismissed_at, metadata, created_at",
      )
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.kinds && opts.kinds.length) q = q.in("kind", opts.kinds);
    const { data, error } = await q;
    if (error) {
      console.warn("[notifications] listNotifications failed:", error.message);
      return [];
    }
    return (data ?? []) as NotificationRow[];
  } catch (err) {
    console.warn("[notifications] listNotifications threw:", err);
    return [];
  }
}

/** Unread count for the bell badge. Falls back to 0 on error. */
export async function countUnread(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("lit_notifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "unread");
    if (error) {
      console.warn("[notifications] countUnread failed:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.warn("[notifications] countUnread threw:", err);
    return 0;
  }
}

export async function markRead(id: string): Promise<boolean> {
  return updateStatus(id, { status: "read", read_at: nowIso(), onlyFrom: ["unread"] });
}

export async function dismissNotification(id: string): Promise<boolean> {
  return updateStatus(id, { status: "dismissed", dismissed_at: nowIso() });
}

/** Mark every unread notification as read for the caller. Returns
 *  the number of rows updated, or 0 on failure. */
export async function markAllRead(): Promise<number> {
  try {
    const now = nowIso();
    const { data, error } = await supabase
      .from("lit_notifications")
      .update({ status: "read", read_at: now })
      .eq("status", "unread")
      .select("id");
    if (error) {
      console.warn("[notifications] markAllRead failed:", error.message);
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    console.warn("[notifications] markAllRead threw:", err);
    return 0;
  }
}

async function updateStatus(
  id: string,
  patch: {
    status: NotificationStatus;
    read_at?: string;
    dismissed_at?: string;
    onlyFrom?: NotificationStatus[];
  },
): Promise<boolean> {
  try {
    const update: Record<string, unknown> = { status: patch.status };
    if (patch.read_at) update.read_at = patch.read_at;
    if (patch.dismissed_at) update.dismissed_at = patch.dismissed_at;
    let q = supabase.from("lit_notifications").update(update).eq("id", id);
    if (patch.onlyFrom && patch.onlyFrom.length) q = q.in("status", patch.onlyFrom);
    const { error } = await q;
    if (error) {
      console.warn("[notifications] update failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[notifications] update threw:", err);
    return false;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
