/**
 * EngagementDrillIn — right-side slide-over showing per-recipient
 * engagement for a single campaign + event type (clicked / opened /
 * replied / bounced / sent).
 *
 * In `clicked` mode each row is expandable to show the per-link
 * breakdown (URL + click count) sourced from lit_outreach_links.
 */
import { useState } from "react";
import { X, Mail, ChevronRight, ChevronDown, UserMinus } from "lucide-react";
import {
  useEngagementRecipients,
  useRecipientLinkClicks,
  type EngagementEventType,
  type EngagementRecipient,
} from "../hooks/useEngagementRecipients";
import { supabase } from "@/lib/supabase";

// Sub-project O — manual recipient exit. Calls recipient-exit-manual edge fn
// with the auth'd user's JWT. The edge fn enforces ownership (campaign owner,
// platform admin, or active org member) so the frontend check is just UX.
async function removeFromSequence(recipientId: string, campaignId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { ok: false, error: "not_authenticated" };
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (window as any).SUPABASE_URL;
  if (!supabaseUrl) return { ok: false, error: "supabase_url_missing" };
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/recipient-exit-manual`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, recipient_id: recipientId, reason: "removed_from_drill_in" }),
    });
    if (!resp.ok) return { ok: false, error: `http_${resp.status}` };
    const body = await resp.json().catch(() => ({}));
    return { ok: !!body?.ok, error: body?.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string | null;
  eventType: EngagementEventType;
}

const EVENT_LABELS: Record<EngagementEventType, string> = {
  sent: "Sent",
  opened: "Opened",
  clicked: "Clicked",
  replied: "Replied",
  bounced: "Bounced",
  meetings: "Meetings",
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function initials(email: string): string {
  const local = email.split("@")[0] || email;
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length === 0) return email.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function LinkClicksRow({
  recipientId,
  campaignId,
}: {
  recipientId: string;
  campaignId: string;
}) {
  const { data: links, isLoading } = useRecipientLinkClicks(
    recipientId,
    campaignId,
  );
  if (isLoading) {
    return (
      <div className="px-4 py-2 text-[11px] text-slate-500">Loading links…</div>
    );
  }
  if (!links || links.length === 0) {
    return (
      <div className="px-4 py-2 text-[11px] text-slate-500">
        No tracked links yet.
      </div>
    );
  }
  return (
    <ul className="space-y-1 px-4 py-2">
      {links.map((link) => (
        <li
          key={link.link_id}
          className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[12px]"
        >
          <span
            className="truncate text-slate-700"
            title={link.original_url}
          >
            {link.original_url}
          </span>
          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-indigo-900">
            {link.click_count}×
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecipientRow({
  recipient,
  campaignId,
  expandable,
}: {
  recipient: EngagementRecipient;
  campaignId: string | null;
  expandable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!campaignId || !recipient.recipient_id) return;
    if (!window.confirm(`Remove ${recipient.recipient_email} from this sequence? They will not receive any further sends.`)) return;
    setRemoving(true);
    const result = await removeFromSequence(recipient.recipient_id, campaignId);
    setRemoving(false);
    if (result.ok) {
      setRemoved(true);
    } else {
      window.alert(`Failed to remove: ${result.error ?? "unknown"}`);
    }
  };
  return (
    <li className="border-b border-slate-100 last:border-none">
      <button
        type="button"
        onClick={() => expandable && setExpanded((v) => !v)}
        disabled={!expandable}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${expandable ? "hover:bg-slate-50" : "cursor-default"}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-[11px] font-bold text-white">
          {initials(recipient.recipient_email)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-slate-900">
            {recipient.display_name || recipient.recipient_email}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Mail className="h-2.5 w-2.5" />
            <span className="truncate">{recipient.recipient_email}</span>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-700"
          title={`${recipient.event_count} events`}
        >
          {recipient.event_count}
        </span>
        <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
          {fmtDate(recipient.last_event_at)}
        </span>
        {/* Sub-project O — manual exit. Renders inside the button so the
            row stays clickable for expand; stopPropagation in handler. */}
        <span
          role="button"
          tabIndex={0}
          onClick={handleRemove}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleRemove(e as unknown as React.MouseEvent);
          }}
          title={removed ? "Removed from sequence" : "Remove from sequence"}
          className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-md transition ${
            removed
              ? "bg-slate-100 text-slate-400 cursor-default"
              : removing
              ? "bg-slate-100 text-slate-400 cursor-wait"
              : "text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
          }`}
          aria-disabled={removed || removing}
        >
          <UserMinus className="h-3 w-3" />
        </span>
        {expandable ? (
          <Chevron className="h-3 w-3 shrink-0 text-slate-400" />
        ) : null}
      </button>
      {expanded && campaignId ? (
        <LinkClicksRow
          recipientId={recipient.recipient_id}
          campaignId={campaignId}
        />
      ) : null}
    </li>
  );
}

export function EngagementDrillIn({
  open,
  onClose,
  campaignId,
  eventType,
}: Props) {
  const { data, isLoading } = useEngagementRecipients(campaignId, eventType, {
    enabled: open,
  });

  if (!open) return null;

  const label = EVENT_LABELS[eventType];
  const expandable = eventType === "clicked";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.5)]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${label} recipients`}
        className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[92vw] flex-col overflow-hidden bg-white shadow-[-16px_0_40px_rgba(15,23,42,0.25)]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Engagement
            </div>
            <h2 className="text-[16px] font-bold text-slate-900">
              {label} · {data?.length ?? 0} recipient{(data?.length ?? 0) === 1 ? "" : "s"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-3 w-3" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-6 text-center text-[12px] text-slate-500">
              Loading recipients…
            </div>
          ) : !data || data.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-slate-500">
              No recipients have {label.toLowerCase()} yet.
            </div>
          ) : (
            <ul>
              {data.map((r) => (
                <RecipientRow
                  key={r.recipient_id}
                  recipient={r}
                  campaignId={campaignId}
                  expandable={expandable}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
