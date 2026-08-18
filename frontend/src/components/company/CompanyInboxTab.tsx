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

import { useEffect, useState, useCallback } from "react";
import { HelpCircle, Inbox, Linkedin, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { listUnipileAccounts } from "@/api/outreach";
import { LinkedInSenderBadge, LinkedInStatusBadge, linkedInContactState } from "@/components/linkedin/LinkedInStatusBadge";

type ConversationType = "direct" | "campaign" | "reply";

type Thread = {
  id: string;
  subject: string | null;
  participants: Array<{ email?: string | null; name?: string | null }> | null;
  last_message_at: string | null;
  message_count: number | null;
  unread_count: number | null;
  conversation_type: ConversationType | null;
  channel: "email";
};

type LinkedInThread = {
  id: string;
  subject: string | null;
  participants: Array<{ name?: string | null; display_name?: string | null; profile_url?: string | null }> | null;
  last_message_at: string | null;
  unread_count: number | null;
  campaign_id: string | null;
  contact_id: string | null;
  channel: "linkedin";
};

type LinkedInAction = {
  id: string;
  recipient_name: string | null;
  message: string;
  status: string;
  action_type: string;
  sent_at: string | null;
  created_at: string;
  contact_id: string | null;
  provider_event_id: string | null;
  provider_chat_id: string | null;
  metadata: Record<string, unknown> | null;
  last_message_at: string;
  unread_count: number;
  channel: "linkedin_action";
};

type CompanyThread = Thread | LinkedInThread | LinkedInAction;

const CONV_CHIP: Record<ConversationType, { label: string; cls: string }> = {
  direct: { label: "Direct", cls: "bg-slate-100 text-slate-600" },
  campaign: { label: "Campaign", cls: "bg-violet-100 text-violet-700" },
  reply: { label: "Reply", cls: "bg-emerald-100 text-emerald-700" },
};

function ConversationTypeChip({ type }: { type: ConversationType | null }) {
  const meta = CONV_CHIP[type ?? "direct"];
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CompanyInboxTab({
  companyId,
  navigate,
}: {
  companyId: string | null | undefined;
  navigate: (path: string) => void;
}) {
  const [threads, setThreads] = useState<CompanyThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [linkedinSenderConnected, setLinkedinSenderConnected] = useState(false);

  // lit_email_threads.company_id is a UUID column — when the route id is
  // a slug like "company/foo" the query crashes with
  // "invalid input syntax for type uuid". Skip the query in that case.
  const isUuid = typeof companyId === "string" && UUID_RE.test(companyId);

  const loadThreads = useCallback(async () => {
    if (!companyId || !isUuid) {
      setLoading(false);
      setThreads([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const { data: emailData, error: emailError } = await supabase
        .from("lit_email_threads")
        .select(
          "id, subject, participants, last_message_at, message_count, unread_count, conversation_type",
        )
        .eq("company_id", companyId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (emailError) throw emailError;

      const { data: contacts, error: contactsError } = await supabase
        .from("lit_contacts")
        .select("id")
        .eq("company_id", companyId)
        .limit(500);
      if (contactsError) throw contactsError;

      const contactIds = (contacts ?? []).map((contact) => contact.id).filter(Boolean);
      let linkedinData: Omit<LinkedInThread, "channel">[] = [];
      let linkedinActions: Omit<LinkedInAction, "channel" | "last_message_at" | "unread_count">[] = [];
      if (contactIds.length > 0) {
        const [threadResult, actionResult] = await Promise.all([
          supabase.from("lit_linkedin_threads")
            .select("id, subject, participants, last_message_at, unread_count, campaign_id, contact_id")
            .in("contact_id", contactIds)
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(50),
          supabase.from("lit_linkedin_outreach_actions")
            .select("id, recipient_name, message, status, action_type, sent_at, created_at, contact_id, provider_event_id, provider_chat_id, metadata")
            .in("contact_id", contactIds)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);
        if (threadResult.error) throw threadResult.error;
        if (actionResult.error) throw actionResult.error;
        linkedinData = (threadResult.data ?? []) as Omit<LinkedInThread, "channel">[];
        linkedinActions = (actionResult.data ?? []) as Omit<LinkedInAction, "channel" | "last_message_at" | "unread_count">[];
      }

      const combined: CompanyThread[] = [
        ...((emailData ?? []) as Omit<Thread, "channel">[]).map((thread) => ({ ...thread, channel: "email" as const })),
        ...linkedinData.map((thread) => ({ ...thread, channel: "linkedin" as const })),
        ...linkedinActions.map((action) => ({ ...action, channel: "linkedin_action" as const, last_message_at: action.sent_at || action.created_at, unread_count: 0 })),
      ].sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
      setThreads(combined);
    } catch (e: any) {
      setErr(e?.message || "Couldn't load conversations");
    } finally {
      setLoading(false);
    }
  }, [companyId, isUuid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadThreads();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadThreads]);

  useEffect(() => {
    listUnipileAccounts(undefined, "campaigns")
      .then((accounts) => setLinkedinSenderConnected(accounts.length > 0))
      .catch(() => setLinkedinSenderConnected(false));
  }, []);

  // "Sync now" — invoke the sync-inbox edge fn with the caller's user JWT.
  // The function syncs the caller's own connected mailboxes, then we reload.
  const syncNow = useCallback(async () => {
    setSyncing(true);
    setErr(null);
    try {
      const { error } = await supabase.functions.invoke("sync-inbox", {
        body: {},
      });
      if (error) throw error;
      await loadThreads();
    } catch (e: any) {
      setErr(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [loadThreads]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Inbox className="h-4 w-4 text-blue-600" />
        <div>
          <div className="text-[13px] font-bold text-[#0F172A]">
            Conversations
          </div>
          <div className="text-[11px] text-slate-500">
            Email and LinkedIn conversations with contacts at this company, kept in one timeline.
          </div>
        </div>
        <LinkedInSenderBadge connected={linkedinSenderConnected} />
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        <button
          type="button"
          onClick={() =>
            navigate(
              `/app/inbox?company_id=${encodeURIComponent(companyId || "")}`,
            )
          }
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open full inbox →
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-[10px] text-slate-500">
        <HelpCircle className="h-3.5 w-3 text-[#0A66C2]" />
        <span><strong className="text-slate-700">LinkedIn status:</strong> Invitation pending means wait; Connected means you can message; Message sent means LinkedIn accepted the delivery.</span>
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
            No email or LinkedIn conversations with this company yet.
            <br />
            <span className="text-slate-400">
              {isUuid
                ? "Mailbox sync and LinkedIn webhook activity will appear here automatically."
                : "This profile is loaded from a slug; open it from your saved Command Center to see the linked inbox."}
            </span>
          </div>
        ) : (
          threads.map((t) => {
            const counterpart = t.channel === "email"
              ? ((t.participants || []).find((p) => p && p.email) || ({} as any))
              : t.channel === "linkedin"
                ? ((t.participants || [])[0] || ({} as any))
                : { name: t.recipient_name };
            const isUnread = (t.unread_count || 0) > 0;
            const linkedInState = t.channel === "linkedin_action" ? linkedInContactState(t) : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  navigate(t.channel === "email"
                    ? `/app/inbox?thread=${encodeURIComponent(t.id)}&company_id=${encodeURIComponent(companyId || "")}`
                    : `/app/inbox?channel=linkedin${t.contact_id ? `&contact_id=${encodeURIComponent(t.contact_id)}` : ""}`)
                }
                className="flex w-full items-start gap-2 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`truncate text-[12.5px] ${isUnread ? "font-bold text-[#0F172A]" : "font-semibold text-slate-700"}`}
                    >
                      {counterpart.name || counterpart.display_name || counterpart.email || "Unknown"}
                    </div>
                    <div className="ml-auto text-[10px] text-slate-400 tabular-nums">
                      {t.last_message_at
                        ? new Date(t.last_message_at).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`truncate text-[11.5px] ${isUnread ? "font-semibold text-[#0F172A]" : "text-slate-500"}`}
                    >
                      {t.channel === "email" ? (t.subject || "(no subject)") : t.channel === "linkedin" ? (t.subject || "LinkedIn conversation") : t.message}
                    </div>
                    {t.channel === "email" ? <ConversationTypeChip type={t.conversation_type} /> : t.channel === "linkedin_action" ? <LinkedInStatusBadge action={t} compact /> : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#0A66C2]"><Linkedin className="h-2.5 w-2.5" /> LinkedIn conversation</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {t.channel === "email" ? <><Mail className="mr-1 inline h-2.5 w-2.5" />{t.message_count} msg{t.message_count === 1 ? "" : "s"}</> : t.channel === "linkedin" ? <><Linkedin className="mr-1 inline h-2.5 w-2.5" />Provider-synced conversation</> : <><Linkedin className="mr-1 inline h-2.5 w-2.5" />{t.provider_event_id || t.provider_chat_id ? "Provider confirmed" : "Awaiting provider confirmation"}</>}
                    {isUnread ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        unread
                      </span>
                    ) : null}
                    {linkedInState?.key === "connected" || linkedInState?.key === "replied" ? (
                      <span className="ml-2 inline-flex items-center gap-1 font-semibold text-[#0A66C2]"><MessageCircle className="h-2.5 w-2.5" />Send message →</span>
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
