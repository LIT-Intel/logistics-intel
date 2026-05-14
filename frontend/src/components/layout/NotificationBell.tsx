// NotificationBell — top-bar bell + popover. Pulls the latest 20
// non-dismissed notifications, surfaces an unread count, and lets
// the user mark-read / dismiss / open the CTA. Heavier inbox lives
// at /app/notifications.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, X, ArrowRight, CheckCheck } from "lucide-react";
import {
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
  dismissNotification,
  type NotificationRow,
  type NotificationSeverity,
} from "@/lib/notifications";

const SEV_DOT: Record<NotificationSeverity, string> = {
  low: "bg-slate-300",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

const REFRESH_INTERVAL_MS = 60_000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [unread, setUnread] = useState(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Refresh count on mount + every minute. Full list loads when the
  // user opens the popover (lazy).
  useEffect(() => {
    let cancelled = false;
    const refreshCount = async () => {
      const n = await countUnread();
      if (!cancelled) setUnread(n);
    };
    refreshCount();
    const id = window.setInterval(refreshCount, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Load rows when popover opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const data = await listNotifications({ limit: 20, statuses: ["unread", "read"] });
      if (!cancelled) setRows(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleRead = async (n: NotificationRow) => {
    if (n.status === "unread") {
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.id === n.id ? { ...r, status: "read", read_at: new Date().toISOString() } : r,
        ),
      );
      setUnread((c) => Math.max(0, c - 1));
      void markRead(n.id);
    }
  };

  const handleAct = async (n: NotificationRow) => {
    await handleRead(n);
    setOpen(false);
    if (n.cta_url) navigate(n.cta_url);
  };

  const handleDismiss = async (n: NotificationRow) => {
    setRows((prev) => (prev ?? []).filter((r) => r.id !== n.id));
    if (n.status === "unread") setUnread((c) => Math.max(0, c - 1));
    void dismissNotification(n.id);
  };

  const handleMarkAll = async () => {
    setRows((prev) =>
      (prev ?? []).map((r) => (r.status === "unread" ? { ...r, status: "read" } : r)),
    );
    setUnread(0);
    void markAllRead();
  };

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      >
        <Bell size={16} />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 z-40 w-[380px] max-w-[calc(100vw-32px)] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {unread > 0 ? (
                <span className="text-[10px] font-bold uppercase tracking-wide text-rose-600">
                  {unread} new
                </span>
              ) : null}
            </div>
            {unread > 0 ? (
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {rows === null ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                You're all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onRead={() => handleRead(n)}
                    onAct={() => handleAct(n)}
                    onDismiss={() => handleDismiss(n)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100 text-right bg-gray-50">
            <Link
              to="/app/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Open full inbox →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationItem({
  n,
  onRead,
  onAct,
  onDismiss,
}: {
  n: NotificationRow;
  onRead: () => void;
  onAct: () => void;
  onDismiss: () => void;
}) {
  const dot = SEV_DOT[n.severity] ?? SEV_DOT.medium;
  const isUnread = n.status === "unread";
  return (
    <li
      onMouseEnter={isUnread ? onRead : undefined}
      className={`px-4 py-3 flex items-start gap-3 ${isUnread ? "bg-blue-50/40" : ""}`}
    >
      <span className={`mt-1.5 inline-block w-2 h-2 rounded-full ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-gray-900" : "text-gray-700"}`}>
          {n.title}
        </p>
        {n.body ? (
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.body}</p>
        ) : null}
        {n.cta_url ? (
          <button
            type="button"
            onClick={onAct}
            className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            {n.cta_label ?? "Open"} <ArrowRight size={11} />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-gray-300 hover:text-gray-500"
      >
        <X size={14} />
      </button>
    </li>
  );
}
