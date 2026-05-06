/**
 * Phase 3.3 — Embedded thread list filtered to one company. Extracted from
 * the inline copy in `frontend/src/pages/Company.jsx` so both the legacy
 * Company page and the new CompanyProfileV2 page can mount the same
 * component without drift. Behavior is identical to the legacy inline copy
 * (UUID guard included) — once Company.jsx is retired we can delete the
 * inline copy and this stays.
 *
 * Reuses `lit_email_threads` (populated by the sync-inbox edge function).
 * Clicking a row opens the full inbox page focused on that thread.
 */

import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Thread = {
  id: string;
  subject: string | null;
  participants: Array<{ email?: string | null; name?: string | null }> | null;
  last_message_at: string | null;
  message_count: number | null;
  unread_count: number | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CompanyInboxTab({
  companyId,
  navigate,
}: {
  companyId: string | null | undefined;
  navigate: (path: string) => void;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // lit_email_threads.company_id is a UUID column — when the route id is
  // a slug like "company/foo" the query crashes with
  // "invalid input syntax for type uuid". Skip the query in that case.
  const isUuid = typeof companyId === "string" && UUID_RE.test(companyId);

  useEffect(() => {
    if (!companyId || !isUuid) {
      setLoading(false);
      setThreads([]);
      setErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data, error } = await supabase
          .from("lit_email_threads")
          .select(
            "id, subject, participants, last_message_at, message_count, unread_count",
          )
          .eq("company_id", companyId)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(50);
        if (cancelled) return;
        if (error) throw error;
        setThreads((data ?? []) as Thread[]);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Couldn't load conversations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, isUuid]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Inbox className="h-4 w-4 text-blue-600" />
        <div>
          <div className="text-[13px] font-bold text-[#0F172A]">
            Conversations
          </div>
          <div className="text-[11px] text-slate-500">
            Email threads with anyone at this company. Replies stay in the same
            thread the recipient sees.
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            navigate(
              `/app/inbox?company_id=${encodeURIComponent(companyId || "")}`,
            )
          }
          className="ml-auto rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open full inbox →
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-md bg-slate-100"
              />
            ))}
          </div>
        ) : err ? (
          <div className="px-4 py-6 text-[12px] text-rose-700">{err}</div>
        ) : threads.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-slate-500">
            No email conversations with this company yet.
            <br />
            <span className="text-slate-400">
              {isUuid
                ? 'Run a campaign or click "Sync mailbox" in the inbox to pull recent threads.'
                : "This profile is loaded from a slug; open it from your saved Command Center to see the linked inbox."}
            </span>
          </div>
        ) : (
          threads.map((t) => {
            const counterpart =
              (t.participants || []).find((p) => p && p.email) || ({} as any);
            const isUnread = (t.unread_count || 0) > 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  navigate(
                    `/app/inbox?thread=${encodeURIComponent(t.id)}&company_id=${encodeURIComponent(companyId || "")}`,
                  )
                }
                className="flex w-full items-start gap-2 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`truncate text-[12.5px] ${isUnread ? "font-bold text-[#0F172A]" : "font-semibold text-slate-700"}`}
                    >
                      {counterpart.name || counterpart.email || "Unknown"}
                    </div>
                    <div className="ml-auto text-[10px] text-slate-400 tabular-nums">
                      {t.last_message_at
                        ? new Date(t.last_message_at).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                  <div
                    className={`truncate text-[11.5px] ${isUnread ? "font-semibold text-[#0F172A]" : "text-slate-500"}`}
                  >
                    {t.subject || "(no subject)"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {t.message_count} msg
                    {t.message_count === 1 ? "" : "s"}
                    {isUnread ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        unread
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
