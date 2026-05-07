// InboxPage — campaign inbox v1.
//
// Two-pane layout: thread list (left) + thread detail (right). Reads
// from public.lit_email_threads / lit_email_messages (org-scoped via
// RLS). The Sync button calls the sync-inbox edge function which
// pulls the most recent 30 days of mail from each connected mailbox.
//
// Replies go through the send-inbox-reply edge function; the new
// outbound row is inserted server-side and a refresh fetches it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bold,
  Inbox,
  Italic,
  Link2,
  Loader2,
  Mail,
  RefreshCw,
  RemoveFormatting,
  Search,
  Send,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

function formatRelative(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.round(diff / min))}m`;
  if (diff < day) return `${Math.round(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(nameOrEmail) {
  if (!nameOrEmail) return "?";
  const s = String(nameOrEmail).trim();
  if (s.includes(" ")) {
    return s.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
}

export default function InboxPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialThreadId = searchParams.get("thread") || null;
  const campaignFilter = searchParams.get("campaign_id") || null;
  const companyFilter = searchParams.get("company_id") || null;
  const contactFilter = searchParams.get("contact_id") || null;

  const { orgId } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(initialThreadId);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'unread'
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const refreshThreads = useCallback(async () => {
    if (!orgId) return;
    setLoadingThreads(true);
    setLoadError(null);
    try {
      let q = supabase
        .from("lit_email_threads")
        .select("id, subject, participants, last_message_at, message_count, unread_count, status, campaign_id, company_id, contact_id, provider, email_account_id")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (campaignFilter) q = q.eq("campaign_id", campaignFilter);
      if (companyFilter) q = q.eq("company_id", companyFilter);
      if (contactFilter) q = q.eq("contact_id", contactFilter);
      const { data, error } = await q;
      if (error) throw error;
      setThreads(data ?? []);
    } catch (e) {
      setLoadError(e?.message || "Couldn't load inbox");
    } finally {
      setLoadingThreads(false);
    }
  }, [orgId, campaignFilter, companyFilter, contactFilter]);

  useEffect(() => { void refreshThreads(); }, [refreshThreads]);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-inbox", { body: {} });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || "sync_failed");
      await refreshThreads();
    } catch (e) {
      setSyncError(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshThreads]);

  const filteredThreads = useMemo(() => {
    let list = threads;
    if (statusFilter === "unread") list = list.filter((t) => (t.unread_count || 0) > 0);
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      list = list.filter((t) =>
        `${t.subject ?? ""} ${(t.participants ?? []).map((p) => `${p.email ?? ""} ${p.name ?? ""}`).join(" ")}`
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [threads, statusFilter, filter]);

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <div className="mx-auto w-full max-w-[1500px] px-3 py-4 md:px-5 md:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-[15px] font-bold text-[#0F172A]">
              <Inbox className="h-4 w-4 text-blue-600" />
              Inbox
            </div>
            <div className="text-[11px] text-slate-500">
              Email conversations from your connected mailboxes. Replies thread back into the campaign.
            </div>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncing ? "Syncing…" : "Sync mailbox"}
          </button>
        </div>

        {syncError && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-semibold">Sync failed</div>
              <div className="font-mono text-[11px]">{syncError}</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
          {/* Thread list */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search subject / sender"
                  className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-3 text-xs text-[#0F172A] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold ${statusFilter === "all" ? "bg-blue-50 text-[#1d4ed8]" : "text-slate-500 hover:bg-slate-50"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("unread")}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold ${statusFilter === "unread" ? "bg-blue-50 text-[#1d4ed8]" : "text-slate-500 hover:bg-slate-50"}`}
              >
                Unread
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loadingThreads ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
                  ))}
                </div>
              ) : loadError ? (
                <div className="px-4 py-6 text-[12px] text-rose-700">{loadError}</div>
              ) : filteredThreads.length === 0 ? (
                <EmptyThreads onSync={handleSync} syncing={syncing} />
              ) : (
                filteredThreads.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    selected={t.id === selectedId}
                    onSelect={() => setSelectedId(t.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Thread detail */}
          <div className="rounded-xl border border-slate-200 bg-white">
            {selectedId ? (
              <ThreadDetail
                threadId={selectedId}
                onChanged={refreshThreads}
              />
            ) : (
              <EmptyDetail />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadRow({ thread, selected, onSelect }) {
  const counterpart = (thread.participants || []).find((p) => p && p.email) || {};
  const subject = thread.subject || "(no subject)";
  const isUnread = (thread.unread_count || 0) > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left transition ${selected ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: isUnread ? "#3B82F6" : "#94a3b8" }}
      >
        {initials(counterpart.name || counterpart.email)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <div className={`truncate text-[12.5px] ${isUnread ? "font-bold text-[#0F172A]" : "font-semibold text-slate-700"}`}>
            {counterpart.name || counterpart.email || "Unknown"}
          </div>
          <div className="ml-auto shrink-0 text-[10px] text-slate-400 tabular-nums">
            {formatRelative(thread.last_message_at)}
          </div>
        </div>
        <div className={`truncate text-[11.5px] ${isUnread ? "font-semibold text-[#0F172A]" : "text-slate-500"}`}>
          {subject}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
          <span>{thread.message_count} msg{thread.message_count === 1 ? "" : "s"}</span>
          {thread.campaign_id ? <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-purple-700">campaign</span> : null}
          {isUnread ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" /> : null}
        </div>
      </div>
    </button>
  );
}

function ThreadDetail({ threadId, onChanged }) {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [composerEmpty, setComposerEmpty] = useState(true);
  const composerRef = useRef(null);

  // Reset the composer when the thread changes so the previous reply
  // doesn't bleed into the new conversation.
  useEffect(() => {
    if (composerRef.current) {
      composerRef.current.innerHTML = "";
      setComposerEmpty(true);
    }
  }, [threadId]);

  // Inline format commands using the contenteditable execCommand API.
  // Deprecated formally but still universally supported and trivial to
  // wire — adequate for an MVP composer; future v2 = ProseMirror/TipTap.
  const exec = (cmd, value) => {
    if (!composerRef.current) return;
    composerRef.current.focus();
    document.execCommand(cmd, false, value);
    setComposerEmpty(!composerRef.current.innerText.trim());
  };
  const handleLink = () => {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    exec("createLink", url);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [tRes, mRes] = await Promise.all([
        supabase.from("lit_email_threads").select("*").eq("id", threadId).maybeSingle(),
        supabase.from("lit_email_messages").select("*").eq("thread_id", threadId).order("message_date", { ascending: true }),
      ]);
      if (tRes.error) throw tRes.error;
      if (mRes.error) throw mRes.error;
      setThread(tRes.data);
      setMessages(mRes.data ?? []);
    } catch (e) {
      setErr(e?.message || "Couldn't load thread");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { void load(); }, [load]);

  const handleSend = async () => {
    if (sending) return;
    const html = composerRef.current?.innerHTML?.trim() ?? "";
    const text = composerRef.current?.innerText?.trim() ?? "";
    if (!text) return;
    setSending(true);
    setSendErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-inbox-reply", {
        body: { thread_id: threadId, body: text, body_html: html },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || "send_failed");
      if (composerRef.current) composerRef.current.innerHTML = "";
      setComposerEmpty(true);
      await load();
      onChanged?.();
    } catch (e) {
      setSendErr(e?.message || "Reply failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      </div>
    );
  }
  if (err) {
    return (
      <div className="flex items-start gap-2 px-4 py-6 text-[12px] text-rose-700">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{err}</span>
      </div>
    );
  }
  if (!thread) {
    return <EmptyDetail />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-5 py-3">
        <div className="text-[14px] font-bold text-[#0F172A]">{thread.subject || "(no subject)"}</div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
          {(thread.participants || []).map((p, i) => (
            <span key={i} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10.5px] text-slate-700">
              {p.name ? `${p.name} <${p.email}>` : p.email}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-[12px] text-slate-500">
            No messages in this thread yet.
          </div>
        ) : messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {/* Toolbar */}
          <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
            <ToolbarButton onClick={() => exec("bold")} title="Bold (Cmd/Ctrl+B)" disabled={sending}>
              <Bold className="h-3 w-3" />
            </ToolbarButton>
            <ToolbarButton onClick={() => exec("italic")} title="Italic (Cmd/Ctrl+I)" disabled={sending}>
              <Italic className="h-3 w-3" />
            </ToolbarButton>
            <ToolbarButton onClick={handleLink} title="Insert link" disabled={sending}>
              <Link2 className="h-3 w-3" />
            </ToolbarButton>
            <span className="mx-0.5 h-3.5 w-px bg-slate-200" />
            <ToolbarButton onClick={() => exec("removeFormat")} title="Clear formatting" disabled={sending}>
              <RemoveFormatting className="h-3 w-3" />
            </ToolbarButton>
            <span className="ml-auto text-[10px] text-slate-400">
              Rich text · sends as HTML
            </span>
          </div>
          {/* Editor */}
          <div className="relative">
            {composerEmpty ? (
              <div className="pointer-events-none absolute left-3 top-2 select-none text-[13px] text-slate-400">
                Type your reply…
              </div>
            ) : null}
            <div
              ref={composerRef}
              contentEditable={!sending}
              suppressContentEditableWarning
              onInput={(e) => setComposerEmpty(!e.currentTarget.innerText.trim())}
              onPaste={(e) => {
                // Strip rich-text styles from pastes — keep links + basic
                // structure but drop colors/fonts/Word-specific markup.
                const text = e.clipboardData?.getData("text/plain");
                if (text) {
                  e.preventDefault();
                  document.execCommand("insertText", false, text);
                }
              }}
              role="textbox"
              aria-multiline="true"
              aria-label="Reply body"
              className="prose-inbox-editor min-h-[100px] w-full px-3 py-2 text-[13px] leading-relaxed text-[#0F172A] focus:outline-none"
              style={{ wordBreak: "break-word" }}
            />
          </div>
          {sendErr ? (
            <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-rose-600">
              {sendErr}
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-2 py-1.5">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || composerEmpty}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {sending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ children, onClick, title, disabled }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function MessageBubble({ message }) {
  const isOut = message.direction === "outbound";
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div
        className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-[11px]"
        style={{ background: isOut ? "#EFF6FF" : "#F8FAFC" }}
      >
        <span className="font-semibold text-[#0F172A]">
          {message.from_name || message.from_email || (isOut ? "You" : "Unknown")}
        </span>
        {isOut ? (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-blue-700">
            Sent
          </span>
        ) : null}
        <span className="ml-auto text-slate-400 tabular-nums">
          {message.message_date ? new Date(message.message_date).toLocaleString() : ""}
        </span>
      </div>
      <div className="px-3 py-2.5 text-[12.5px] text-slate-700">
        {message.body_html ? (
          <div
            className="prose-inbox"
            // Rendering inbound HTML as-is; inbox stays inside the
            // user's app domain so cookies aren't accessible. Future
            // hardening: dompurify before insertion.
            dangerouslySetInnerHTML={{ __html: message.body_html }}
          />
        ) : message.body_text ? (
          <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed">
            {message.body_text}
          </pre>
        ) : message.snippet ? (
          <span className="italic text-slate-500">{message.snippet}</span>
        ) : (
          <span className="italic text-slate-400">(empty)</span>
        )}
      </div>
    </div>
  );
}

function EmptyThreads({ onSync, syncing }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
        <Mail className="h-4 w-4 text-blue-600" />
      </div>
      <div className="mt-2 text-[13px] font-bold text-[#0F172A]">No conversations yet</div>
      <p className="mt-1 max-w-[260px] text-[11.5px] text-slate-500">
        Click "Sync mailbox" to pull recent threads from your connected Gmail or Microsoft 365 account.
      </p>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm disabled:opacity-50"
      >
        {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Mail className="h-5 w-5 text-slate-400" />
      </div>
      <div className="mt-2 text-[13px] font-bold text-[#0F172A]">Pick a thread</div>
      <p className="mt-1 max-w-[320px] text-[12px] text-slate-500">
        Select a conversation on the left to read it and reply. The reply lands in the same email thread the recipient sees.
      </p>
    </div>
  );
}
