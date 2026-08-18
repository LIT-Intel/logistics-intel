import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Linkedin, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  approveAndSendLinkedIn,
  draftLinkedInOutreach,
  listUnipileAccounts,
  startUnipileLinkedIn,
  updateLinkedInDraft,
  type LinkedInOutreachAction,
} from "@/api/outreach";

type Recipient = { id: string; display_name: string | null; email: string; linkedin_url: string | null };
type Step = { id: string; step_order: number; step_type: string; body: string | null };

export default function LinkedInApprovalQueue({ campaignId }: { campaignId: string }) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [actions, setActions] = useState<LinkedInOutreachAction[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [accountRows, recipientsResult, stepsResult, actionsResult] = await Promise.all([
        listUnipileAccounts(undefined, "campaigns"),
        supabase.from("lit_campaign_contacts").select("id,display_name,email,linkedin_url").eq("campaign_id", campaignId).order("created_at").limit(100),
        supabase.from("lit_campaign_steps").select("id,step_order,step_type,body").eq("campaign_id", campaignId).in("step_type", ["linkedin", "linkedin_invite", "linkedin_message"]).order("step_order"),
        supabase.from("lit_linkedin_outreach_actions").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false }),
      ]);
      if (recipientsResult.error) throw recipientsResult.error;
      if (stepsResult.error) throw stepsResult.error;
      if (actionsResult.error) throw actionsResult.error;
      setConnected(accountRows.some((a) => a.status === "OK" && a.use_for_campaigns));
      setRecipients((recipientsResult.data || []) as Recipient[]);
      setSteps((stepsResult.data || []) as Step[]);
      setActions((actionsResult.data || []) as LinkedInOutreachAction[]);
    } catch (e: any) { setError(e?.message || "Could not load LinkedIn approvals"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [campaignId]);

  const latestByRecipientStep = useMemo(() => {
    const map = new Map<string, LinkedInOutreachAction>();
    for (const action of actions) {
      if (!action.campaign_contact_id || !action.campaign_step_id) continue;
      const key = `${action.campaign_contact_id}:${action.campaign_step_id}`;
      if (!map.has(key)) map.set(key, action);
    }
    return map;
  }, [actions]);
  const summary = useMemo(() => ({
    ready: actions.filter((a) => a.status === "pending_approval").length,
    sent: actions.filter((a) => a.status === "sent" || a.status === "replied").length,
    missing: recipients.filter((r) => !r.linkedin_url).length,
    replied: actions.filter((a) => a.status === "replied").length,
  }), [actions, recipients]);

  if (!loading && steps.length === 0) return null;
  async function connect() {
    try {
      const result = await startUnipileLinkedIn({ purpose: "campaigns", returnUrl: `/app/campaigns/new?edit=${encodeURIComponent(campaignId)}` });
      window.location.assign(result.url);
    } catch (e: any) { setError(e?.message || "Could not connect LinkedIn"); }
  }

  async function createDraft(recipient: Recipient, step: Step) {
    if (!recipient.linkedin_url) return;
    setBusyId(recipient.id); setError(null);
    try {
      const action = await draftLinkedInOutreach({
        campaignContactId: recipient.id,
        campaignStepId: step.id,
        linkedinUrl: recipient.linkedin_url,
        actionType: step.step_type === "linkedin_message" ? "message" : "invite",
        angle: step.body || undefined,
      });
      setActions((prev) => [action, ...prev.filter((a) => a.id !== action.id)]);
    } catch (e: any) { setError(e?.message || "Could not create LinkedIn draft"); }
    finally { setBusyId(null); }
  }

  async function saveDraft(action: LinkedInOutreachAction, recipientId: string) {
    setBusyId(recipientId); setError(null);
    try {
      const updated = await updateLinkedInDraft(action.id, action.message);
      setActions((prev) => [updated, ...prev.filter((a) => a.id !== updated.id)]);
    } catch (e: any) { setError(e?.message || "Could not update LinkedIn draft"); }
    finally { setBusyId(null); }
  }

  async function approve(action: LinkedInOutreachAction, recipientId: string) {
    if (!window.confirm(`Approve and send this LinkedIn ${action.action_type}?`)) return;
    setBusyId(recipientId); setError(null);
    try {
      const sent = await approveAndSendLinkedIn(action.id);
      setActions((prev) => [sent, ...prev.filter((a) => a.id !== sent.id)]);
    } catch (e: any) { setError(e?.message || "LinkedIn send stopped"); await load(); }
    finally { setBusyId(null); }
  }

  return (
    <section className="mx-4 my-3 rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Linkedin className="h-4 w-4 text-[#0A66C2]" /> LinkedIn approval queue</div>
          <p className="mt-1 text-xs text-slate-500">The outreach agent drafts each touch. A person must approve it before Unipile sends.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"><RefreshCw className="h-3 w-3" /> Refresh</button>
          {!connected ? <button type="button" onClick={connect} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white"><Linkedin className="h-3 w-3" /> Connect LinkedIn</button> : null}
        </div>
      </div>
      {error ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
      {!loading ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Awaiting approval", summary.ready, "text-amber-700 bg-amber-50"],
            ["Sent", summary.sent, "text-blue-700 bg-blue-50"],
            ["Replies", summary.replied, "text-emerald-700 bg-emerald-50"],
            ["Missing LinkedIn URL", summary.missing, "text-rose-700 bg-rose-50"],
          ].map(([label, value, tone]) => <div key={String(label)} className={`rounded-lg px-3 py-2 ${tone}`}><div className="text-lg font-bold">{value}</div><div className="text-[10px] font-semibold uppercase tracking-wide">{label}</div></div>)}
        </div>
      ) : null}
      {loading ? <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading recipients…</div> : recipients.length === 0 ? (
        <div className="mt-4 text-xs text-slate-500">No enrolled campaign recipients yet.</div>
      ) : (
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {recipients.map((recipient) => {
            const nextStep = steps.find((step) => {
              const prior = latestByRecipientStep.get(`${recipient.id}:${step.id}`);
              return !prior || !["sent", "replied"].includes(prior.status);
            });
            const action = nextStep ? latestByRecipientStep.get(`${recipient.id}:${nextStep.id}`) : undefined;
            const busy = busyId === recipient.id;
            return (
              <div key={recipient.id} className="flex flex-col gap-2 px-3 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-slate-900">{recipient.display_name || recipient.email}</div>
                  <div className="truncate text-[11px] text-slate-500">{recipient.linkedin_url || "LinkedIn URL missing — enrich or edit this contact"}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {nextStep ? `Step ${nextStep.step_order}: ${nextStep.step_type.replaceAll("_", " ")}` : "LinkedIn sequence complete"}
                  </div>
                  {action?.status === "pending_approval" ? (
                    <textarea value={action.message} maxLength={action.action_type === "invite" ? 280 : 1000}
                      onChange={(e) => setActions((prev) => prev.map((a) => a.id === action.id ? { ...a, message: e.target.value } : a))}
                      rows={3} className="mt-2 w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 text-[11px] leading-4 text-slate-700" />
                  ) : action ? <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-700">{action.message}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {action?.status === "pending_approval" ? (
                    <><button type="button" disabled={busy || !action.message.trim()} onClick={() => void saveDraft(action, recipient.id)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Save edits</button>
                    <button type="button" disabled={busy || !action.message.trim()} onClick={() => void approve(action, recipient.id)} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Send className="h-3 w-3" /> Approve &amp; send</button></>
                  ) : !nextStep ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Complete</span>
                  ) : (
                    <button type="button" disabled={!connected || !recipient.linkedin_url || busy} onClick={() => void createDraft(recipient, nextStep)} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50"><Sparkles className="h-3 w-3" /> {busy ? "Drafting…" : action?.status === "failed" || action?.status === "cancelled" ? "Redraft" : "Create draft"}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
