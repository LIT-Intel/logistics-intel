// Full notifications inbox at /app/notifications. Pulls up to 200
// notifications, supports status + kind filters, and offers mark-all-
// read. Dismissed notifications stay archivable via the "Dismissed"
// filter.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, ArrowRight, X, CheckCheck, Inbox } from "lucide-react";
import {
  listNotifications,
  markRead,
  markAllRead,
  dismissNotification,
  type NotificationRow,
  type NotificationKind,
  type NotificationSeverity,
  type NotificationStatus,
} from "@/lib/notifications";
import AlertPreferencesPanel from "@/features/notifications/AlertPreferencesPanel";

const SEV_DOT: Record<NotificationSeverity, string> = {
  low: "bg-slate-300",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

const KIND_LABEL: Record<NotificationKind, string> = {
  signal: "Signal",
  reply: "Reply",
  campaign: "Campaign",
  billing: "Billing",
  system: "System",
  invite: "Invite",
  enrichment: "Enrichment",
};

const ALL_KINDS: NotificationKind[] = [
  "signal",
  "reply",
  "campaign",
  "billing",
  "system",
  "invite",
  "enrichment",
];

type StatusTab = "active" | "unread" | "dismissed";

const STATUS_FILTERS: Record<StatusTab, NotificationStatus[]> = {
  active: ["unread", "read"],
  unread: ["unread"],
  dismissed: ["dismissed"],
};

export default function NotificationsInbox() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<StatusTab>("active");
  const [kindFilter, setKindFilter] = useState<NotificationKind | "all">("all");
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setRows(null);
    const data = await listNotifications({
      statuses: STATUS_FILTERS[tab],
      kinds: kindFilter === "all" ? undefined : [kindFilter],
      limit: 200,
    });
    setRows(data);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kindFilter]);

  const handleMarkAll = async () => {
    setBusy(true);
    const n = await markAllRead();
    setBusy(false);
    if (n > 0) await reload();
  };

  const handleAct = async (n: NotificationRow) => {
    if (n.status === "unread") {
      await markRead(n.id);
    }
    if (n.cta_url) navigate(n.cta_url);
  };

  const handleDismiss = async (n: NotificationRow) => {
    setRows((prev) => (prev ?? []).filter((r) => r.id !== n.id));
    await dismissNotification(n.id);
  };

  const visible = rows ?? [];
  const unreadInTab = visible.filter((r) => r.status === "unread").length;

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1080px]">
        <header className="flex items-end justify-between flex-wrap gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
              <Bell size={12} /> Inbox
            </div>
            <h1
              className="text-2xl font-bold text-slate-900 mt-1"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Notifications
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Signals, replies, billing, and system messages — all in one place.
            </p>
          </div>
          {unreadInTab > 0 ? (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 disabled:opacity-50"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          ) : null}
        </header>

        <div className="mb-5">
          <AlertPreferencesPanel />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <TabBtn label="Active" active={tab === "active"} onClick={() => setTab("active")} />
              <TabBtn label="Unread" active={tab === "unread"} onClick={() => setTab("unread")} />
              <TabBtn label="Dismissed" active={tab === "dismissed"} onClick={() => setTab("dismissed")} />
            </div>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as NotificationKind | "all")}
              className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="all">All types</option>
              {ALL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          {rows === null ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">Loading…</div>
          ) : visible.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((n) => (
                <Row
                  key={n.id}
                  n={n}
                  onAct={() => handleAct(n)}
                  onDismiss={() => handleDismiss(n)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-semibold rounded-md ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ tab }: { tab: StatusTab }) {
  const message =
    tab === "unread"
      ? "No unread notifications — you're caught up."
      : tab === "dismissed"
      ? "Nothing in the archive yet."
      : "No notifications yet. Signals will land here as your accounts move.";
  return (
    <div className="px-6 py-16 text-center">
      <Inbox className="w-7 h-7 text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function Row({
  n,
  onAct,
  onDismiss,
}: {
  n: NotificationRow;
  onAct: () => void;
  onDismiss: () => void;
}) {
  const dot = SEV_DOT[n.severity] ?? SEV_DOT.medium;
  const isUnread = n.status === "unread";
  const kindLabel = KIND_LABEL[n.kind] ?? n.kind;
  const created = new Date(n.created_at).toLocaleString();
  return (
    <li className={`px-5 py-4 flex items-start gap-3 ${isUnread ? "bg-blue-50/40" : ""}`}>
      <span className={`mt-1.5 inline-block w-2 h-2 rounded-full ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className={`text-sm leading-snug ${isUnread ? "font-bold text-slate-900" : "text-slate-700"}`}>
            {n.title}
          </p>
          <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400">
            {kindLabel}
          </span>
        </div>
        {n.body ? <p className="text-xs text-slate-500 leading-snug mb-1.5">{n.body}</p> : null}
        <div className="flex items-center gap-3 flex-wrap">
          {n.cta_url ? (
            <button
              type="button"
              onClick={onAct}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              {n.cta_label ?? "Open"} <ArrowRight size={11} />
            </button>
          ) : null}
          <span className="text-[11px] text-slate-400">{created}</span>
        </div>
      </div>
      {n.status !== "dismissed" ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-slate-300 hover:text-slate-500"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      ) : null}
    </li>
  );
}
