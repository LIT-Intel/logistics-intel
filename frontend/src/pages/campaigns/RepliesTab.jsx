// RepliesTab — campaign-analytics tab that lists replies.
//
// Source-of-truth: lit_outreach_history WHERE event_type='replied',
// joined to lit_contacts (id, full_name, email, title, company_id)
// and lit_companies (name).
//
// The reply-receiver pipeline (Task 10) writes snippet/from/subject keys
// into lit_outreach_history.metadata — match that column (NOT `payload`).
//
// Props:
//   - campaignId (optional): when present, scopes to a single campaign.
//     When absent, scopes to the caller's org via orgUserIds.
//   - orgUserIds (optional): when no campaignId is provided, restrict
//     the query to events authored by these users (matches the org-scoping
//     pattern used elsewhere on CampaignAnalyticsPage).

import { useEffect, useState } from "react";
import { Reply } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function RepliesTab({ campaignId, orgUserIds }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stable key for the orgUserIds dep — JSON.stringify in the dep array
  // is a complex expression that exhaustive-deps can't statically check.
  // Extracted so the rule can reason about it.
  const orgUserIdsKey = JSON.stringify(orgUserIds || null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from("lit_outreach_history")
          .select(`
            id, occurred_at, metadata, provider, channel, subject,
            campaign_id,
            contact:lit_contacts(id, full_name, email, title, company_id, company:lit_companies(name))
          `)
          .eq("event_type", "replied")
          .order("occurred_at", { ascending: false })
          .limit(200);
        if (campaignId) {
          q = q.eq("campaign_id", campaignId);
        } else if (Array.isArray(orgUserIds) && orgUserIds.length) {
          q = q.in("user_id", orgUserIds);
        } else if (Array.isArray(orgUserIds) && orgUserIds.length === 0) {
          // No org users → no replies to show.
          if (!cancelled) {
            setReplies([]);
            setLoading(false);
          }
          return;
        }
        const { data, error: err } = await q;
        if (cancelled) return;
        if (err) throw err;
        setReplies(data || []);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load replies");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // orgUserIds itself is intentionally NOT in the deps — orgUserIdsKey
    // is the stable serialization. orgUserIds array identity changes on every
    // render in some parents but its CONTENTS rarely do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, orgUserIdsKey]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading replies…</div>;
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-rose-700">
        Couldn't load replies: <span className="font-mono text-xs">{error}</span>
      </div>
    );
  }
  if (!replies.length) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-slate-500">No replies yet.</p>
        <p className="mt-1 text-xs text-slate-400">
          Replies appear here within 30 seconds of arrival.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {replies.map((r) => {
        const meta = r.metadata || {};
        const snippet = meta.snippet || meta.body_preview || "";
        const from = meta.from || r.contact?.email;
        const subject = r.subject || meta.subject;
        const inboxHref =
          r.provider === "gmail"
            ? "https://mail.google.com/mail/u/0/#inbox"
            : "https://outlook.live.com/mail/0/inbox";
        const inboxLabel = r.provider === "gmail" ? "Gmail" : "Outlook";
        return (
          <div key={r.id} className="flex items-start gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Reply className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-slate-900">
                  {r.contact?.full_name || from || "Unknown sender"}
                </span>
                {r.contact?.company?.name && (
                  <span className="text-xs text-slate-500">
                    at {r.contact.company.name}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {new Date(r.occurred_at).toLocaleString()}
                </span>
              </div>
              {r.contact?.title && (
                <div className="text-xs text-slate-500">{r.contact.title}</div>
              )}
              {subject && (
                <div className="mt-1 text-sm font-medium text-slate-800">
                  {subject}
                </div>
              )}
              {snippet && (
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {snippet}
                </p>
              )}
              <div className="mt-2 flex gap-2 text-xs">
                <a
                  href={inboxHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Open in {inboxLabel}
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
