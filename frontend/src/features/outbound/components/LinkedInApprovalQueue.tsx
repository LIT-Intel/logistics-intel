import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HelpCircle, Linkedin, Loader2, Mail, RefreshCw, Send, Sparkles, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  approveAndSendLinkedIn,
  cancelLinkedInOutreach,
  deleteLinkedInOutreach,
  dismissLinkedInOutreach,
  draftLinkedInOutreach,
  listUnipileAccounts,
  startUnipileLinkedIn,
  updateLinkedInDraft,
  type LinkedInOutreachAction,
} from "@/api/outreach";
import { LinkedInSenderBadge, LinkedInStatusBadge, linkedInContactState } from "@/components/linkedin/LinkedInStatusBadge";

type Recipient = { id: string; display_name: string | null; email: string; linkedin_url: string | null; status: string | null; last_error: string | null };
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
        supabase.from("lit_campaign_contacts").select("id,display_name,email,linkedin_url,status,last_error").eq("campaign_id", campaignId).order("created_at").limit(100),
        supabase.from("lit_campaign_steps").select("id,step_order,step_type,body").eq("campaign_id", campaignId).in("step_type", ["linkedin", "linkedin_invite", "linkedin_message"]).order("step_order"),
        supabase.from("lit_linkedin_outreach_actions").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false }),
      ]);
      if (recipientsResult.error) throw recipientsResult.error;
      if (stepsResult.error) throw stepsResult.error;
      if (actionsResult.error) throw actionsResult.error;
      setConnected(accountRows.some((a) => a.status === "OK" && a.use_for_campaigns));
      setRecipients((recipientsResult.data || []) as Recipient[]);
      setSteps((stepsResult.data || []) as Step[]);
      setActions(((actionsResult.data || []) as LinkedInOutreachAction[]).filter((action) => action.metadata?.hidden_in_lead_crm !== true));
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

  async function createDraft(recipient: Recipient, step: Step, regenerate = false) {
    if (!recipient.linkedin_url) return;
    setBusyId(recipient.id); setError(null);
    try {
      const action = await draftLinkedInOutreach({
        campaignContactId: recipient.id,
        campaignStepId: step.id,
        linkedinUrl: recipient.linkedin_url,
        actionType: step.step_type === "linkedin_message" ? "message" : "invite",
        angle: step.body || undefined,
        regenerate,
      });
      setActions((prev) => [action, ...prev.filter((a) => a.id !== action.id)]);
    } catch (e: any) { setError(e?.message || "Could not create LinkedIn draft"); }
    finally { setBusyId(null); }
  }

  async function cancelAction(action: LinkedInOutreachAction, recipientId: string) {
    if (!window.confirm("Cancel this unsent LinkedIn action?")) return;
    setBusyId(recipientId); setError(null);
    try {
      await cancelLinkedInOutreach(action.id);
      setActions((prev) => prev.map((item) => item.id === action.id ? { ...item, status: "cancelled" } : item));
    } catch (e: any) { setError(e?.message || "Could not cancel LinkedIn action"); }
    finally { setBusyId(null); }
  }

  async function removeAction(action: LinkedInOutreachAction, recipientId: string) {
    const unsent = action.status === "cancelled" || action.status === "failed";
    if (!window.confirm(unsent ? "Delete this unsent draft permanently?" : "Remove this test from the campaign view? Delivery audit data will be retained.")) return;
    setBusyId(recipientId); setError(null);
    try {
      if (unsent) await deleteLinkedInOutreach(action.id); else await dismissLinkedInOutreach(action.id);
      setActions((prev) => prev.filter((item) => item.id !== action.id));
    } catch (e: any) { setError(e?.message || "Could not remove LinkedIn action"); }
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
      const sent = await approveAndSendLinkedIn(action.id, action.message.trim());
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
          <div className="mt-2"><LinkedInSenderBadge connected={connected} /></div>
          <div className="mt-2 flex max-w-2xl items-start gap-1.5 text-[10px] leading-4 text-slate-500"><HelpCircle className="mt-0.5 h-3 w-3 shrink-0 text-[#0A66C2]" />Invitation pending means wait. Connected means the message action is available. Message sent means LinkedIn accepted delivery.</div>
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
            const recipientActions = actions.filter((item) => item.campaign_contact_id === recipient.id);
            const nextStep = steps.find((step) => {
              const prior = latestByRecipientStep.get(`${recipient.id}:${step.id}`);
              return !prior || !["sent", "replied"].includes(prior.status);
            });
            const action = nextStep ? latestByRecipientStep.get(`${recipient.id}:${nextStep.id}`) : recipientActions[0];
            const actionStep = action?.campaign_step_id ? steps.find((step) => step.id === action.campaign_step_id) : nextStep;
            const messageStep = steps.find((step) => step.step_type === "linkedin_message" && (!actionStep || step.step_order >= actionStep.step_order));
            const contactState = linkedInContactState(action);
            const busy = busyId === recipient.id;
            return (
              <div key={recipient.id} className="flex flex-col gap-2 px-3 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-slate-900">{recipient.display_name || recipient.email}</div>
                  <div className="truncate text-[11px] text-slate-500">{recipient.linkedin_url || "LinkedIn URL missing — enrich or edit this contact"}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"><Mail className="h-2.5 w-2.5" /> Email · {recipient.status || "queued"}</span>
                    {recipient.linkedin_url ? <LinkedInStatusBadge action={action} compact /> : <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700"><Linkedin className="h-2.5 w-2.5" /> Profile missing</span>}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {nextStep ? `Step ${nextStep.step_order}: ${nextStep.step_type.replaceAll("_", " ")}` : "LinkedIn sequence complete"}
                  </div>
                  {recipientActions.length > 1 ? <div className="mt-1 text-[10px] text-slate-400">{recipientActions.length} LinkedIn actions retained in campaign history</div> : null}
                  {action?.status === "pending_approval" ? (
                    <div className="mt-2">
                    {Array.isArray(action.metadata?.draft_options) ? <div className="mb-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5">{action.metadata.draft_options.map((option) => <button key={option.tone} type="button" onClick={() => setActions((prev) => prev.map((a) => a.id === action.id ? { ...a, message: option.message, agent_rationale: option.rationale } : a))} className={`rounded-lg border p-2 text-left ${option.message === action.message ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}><div className="text-[9px] font-bold uppercase tracking-wide text-blue-700">{option.tone}</div><div className="mt-1 text-[10.5px] leading-4 text-slate-700">{option.message}</div></button>)}</div> : null}
                    <textarea value={action.message} maxLength={action.action_type === "invite" ? 200 : 1000}
                      onChange={(e) => setActions((prev) => prev.map((a) => a.id === action.id ? { ...a, message: e.target.value } : a))}
                      rows={3} className="mt-2 w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 text-[11px] leading-4 text-slate-700" />
                    <div className="mt-1 text-[10px] text-slate-400">{action.message.length}/{action.action_type === "invite" ? 200 : 1000} · The exact text shown will be sent.</div>
                    </div>
                  ) : action ? <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-700">{action.message}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {action?.status === "pending_approval" ? (
                    <><button type="button" disabled={busy || !action.message.trim()} onClick={() => void saveDraft(action, recipient.id)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Save edits</button>
                    <button type="button" disabled={busy || !actionStep} onClick={() => actionStep && void createDraft(recipient, actionStep, true)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">5 new options</button>
                    <button type="button" disabled={busy || !action.message.trim()} onClick={() => void approve(action, recipient.id)} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Send className="h-3 w-3" /> Approve &amp; send</button>
                    <button type="button" disabled={busy} onClick={() => void cancelAction(action, recipient.id)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"><XCircle className="h-3 w-3" /> Cancel</button></>
                  ) : action?.status === "sent" || action?.status === "replied" ? (
                    <>{(contactState.key === "connected" || contactState.key === "replied") && messageStep ? <button type="button" disabled={busy} onClick={() => void createDraft(recipient, messageStep, true)} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Send className="h-3 w-3" /> Send message</button> : null}
                    <button type="button" disabled={busy || !actionStep} onClick={() => actionStep && void createDraft(recipient, actionStep, true)} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50">Create editable 5-option draft</button>
                    <button type="button" disabled={busy} onClick={() => void removeAction(action, recipient.id)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50"><Trash2 className="h-3 w-3" /> Remove</button></>
                  ) : action?.status === "cancelled" || action?.status === "failed" ? (
                    <><button type="button" disabled={busy || !actionStep} onClick={() => actionStep && void createDraft(recipient, actionStep, true)} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50">Redraft 5 options</button>
                    <button type="button" disabled={busy} onClick={() => void removeAction(action, recipient.id)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50"><Trash2 className="h-3 w-3" /> Delete</button></>
                  ) : !nextStep ? (
                    <span title={action?.provider_event_id || action?.provider_chat_id || "Provider accepted"} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Provider accepted</span>
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
