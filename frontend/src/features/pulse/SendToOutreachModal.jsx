// SendToOutreachModal — Pulse Quick Card "Send to outreach" 1-click flow.
//
// Composes the existing pieces into a 2-click outreach launch:
//   1. Pick template (Freight broker / Freight forwarder / existing campaign)
//   2. Pick sender mailbox (lit_email_accounts.status='active')
//   3. Confirm recipient contacts (decision-makers attached to the company)
//   4. Submit → creates lit_campaigns + seeds lit_campaign_steps from the
//      LIT marketing template registry, then calls queue-campaign-recipients
//      with the selected recipients as manual_emails so the dispatcher
//      (send-campaign-email cron) picks them up on the next tick (≤60s).
//
// Vendor-neutral copy — no third-party CRM source named.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  freightBrokerTemplates,
  smallForwarderTemplates,
} from "@/lib/campaignEmailTemplates";

const DELAY_DAYS = [0, 3, 7, 14];

export default function SendToOutreachModal({ company, contacts = [], onClose, onSuccess }) {
  const [audience, setAudience] = useState("broker"); // 'broker' | 'forwarder' | 'existing'
  const [existingCampaignId, setExistingCampaignId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [mailboxes, setMailboxes] = useState([]);
  const [existingCampaigns, setExistingCampaigns] = useState([]);
  const eligibleContacts = (contacts || []).filter((c) => c && c.email);
  const [selectedContactIds, setSelectedContactIds] = useState(
    eligibleContacts.map((c) => c.id || c.source_contact_key || c.email),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // status canonically reads 'connected' on healthy mailboxes per
      // the OAuth callbacks; some legacy rows may use 'active'. Accept
      // either so the modal finds the user's mailbox in both cases.
      const { data: mb } = await supabase
        .from("lit_email_accounts")
        .select("id, email, provider, status, is_primary")
        .eq("user_id", user.id)
        .in("status", ["connected", "active"])
        .order("is_primary", { ascending: false });
      const mailboxList = mb || [];
      setMailboxes(mailboxList);
      if (mailboxList.length > 0) {
        setSenderId(mailboxList[0].id);
      }

      const { data: camps } = await supabase
        .from("lit_campaigns")
        .select("id, name, status")
        .eq("user_id", user.id)
        .in("status", ["draft", "active"])
        .order("created_at", { ascending: false })
        .limit(50);
      setExistingCampaigns(camps || []);
    })();
  }, []);

  const noMailbox = mailboxes.length === 0;
  const companyId = company?.id || company?.business_id || company?.company_id || null;

  function contactRowKey(c) {
    return c.id || c.source_contact_key || c.email;
  }

  function toggleContact(key) {
    setSelectedContactIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  }

  async function handleLaunch() {
    setSubmitting(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let campaignId = existingCampaignId;

      if (audience !== "existing") {
        // Pick the matching 4-email template set.
        const templates =
          audience === "broker" ? freightBrokerTemplates : smallForwarderTemplates;

        // 1. Create the campaign with sender pinned in metrics.
        const { data: c, error: ce } = await supabase
          .from("lit_campaigns")
          .insert({
            user_id: user.id,
            name: `${company?.name || "Outreach"} — ${
              audience === "broker" ? "Broker" : "Forwarder"
            } outreach`,
            status: "active",
            channel: "email",
            metrics: { sender_account_id: senderId },
          })
          .select("id")
          .single();
        if (ce) throw ce;
        campaignId = c.id;

        // 2. Seed campaign steps from the 4-email template registry.
        const stepRows = templates.map((t, i) => ({
          campaign_id: campaignId,
          step_order: i + 1,
          channel: "email",
          step_type: "email",
          subject: t.subject,
          body: t.html,
          delay_days: DELAY_DAYS[i] ?? 0,
          delay_hours: 0,
          delay_minutes: 0,
          include_signature: true,
        }));
        const { error: se } = await supabase
          .from("lit_campaign_steps")
          .insert(stepRows);
        if (se) throw se;
      } else if (existingCampaignId) {
        // Patch sender_account_id onto existing campaign if missing.
        const { data: existing } = await supabase
          .from("lit_campaigns")
          .select("metrics")
          .eq("id", existingCampaignId)
          .single();
        if (!existing?.metrics?.sender_account_id && senderId) {
          await supabase
            .from("lit_campaigns")
            .update({
              metrics: { ...(existing?.metrics || {}), sender_account_id: senderId },
            })
            .eq("id", existingCampaignId);
        }
      }

      if (!campaignId) throw new Error("No campaign selected");

      // 3. Attach the company to the campaign so queue-campaign-recipients
      //    can pull lit_contacts joined to it. Idempotent upsert keyed on
      //    (campaign_id, company_id).
      if (companyId) {
        await supabase
          .from("lit_campaign_companies")
          .upsert(
            [{ campaign_id: campaignId, company_id: companyId }],
            { onConflict: "campaign_id,company_id", ignoreDuplicates: true },
          );
      }

      // 4. Pass user-selected recipients as manual_emails so we ship only
      //    the contacts the user checked (not every lit_contacts row for
      //    the company). The edge fn dedupes against lit_contacts hits by
      //    email, so this is safe to combine.
      const manualEmails = eligibleContacts
        .filter((c) => selectedContactIds.includes(contactRowKey(c)))
        .map((c) => ({
          email: c.email,
          first_name: c.first_name || null,
          last_name: c.last_name || null,
          company_name: company?.name || null,
        }));

      const { data: qr, error: qe } = await supabase.functions.invoke(
        "queue-campaign-recipients",
        {
          body: {
            campaign_id: campaignId,
            manual_emails: manualEmails,
          },
        },
      );
      if (qe) throw qe;

      onSuccess?.({
        campaignId,
        queued: qr?.queued ?? manualEmails.length,
      });
    } catch (err) {
      console.error("[SendToOutreachModal] launch failed:", err);
      setError(err?.message || "Failed to launch outreach");
    } finally {
      setSubmitting(false);
    }
  }

  const canLaunch =
    !submitting &&
    !noMailbox &&
    selectedContactIds.length > 0 &&
    (audience !== "existing" || !!existingCampaignId);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Send {eligibleContacts.length} contact
              {eligibleContacts.length === 1 ? "" : "s"} at {company?.name || "this company"}
            </h2>
            <p className="font-body mt-1 text-sm text-slate-500">
              Sequence runs over 14 days. Replies pause that recipient automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {noMailbox && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Connect Gmail or Outlook in Settings → Integrations to enable outreach.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="font-display text-xs font-medium uppercase tracking-wide text-slate-500">
              Template
            </label>
            <div className="mt-2 space-y-2">
              {["broker", "forwarder", "existing"].map((a) => (
                <label
                  key={a}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                >
                  <input
                    type="radio"
                    name="audience"
                    value={a}
                    checked={audience === a}
                    onChange={() => setAudience(a)}
                  />
                  <span className="font-body text-sm text-slate-800">
                    {a === "broker" && "Freight broker (4 emails)"}
                    {a === "forwarder" && "Freight forwarder (4 emails)"}
                    {a === "existing" && "Add to existing campaign…"}
                  </span>
                </label>
              ))}
              {audience === "existing" && (
                <select
                  value={existingCampaignId}
                  onChange={(e) => setExistingCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Pick a campaign…</option>
                  {existingCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="font-display text-xs font-medium uppercase tracking-wide text-slate-500">
              Send from
            </label>
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              disabled={noMailbox}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            >
              {mailboxes.length === 0 ? (
                <option value="">No active mailbox</option>
              ) : (
                mailboxes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email} ({m.provider})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="font-display text-xs font-medium uppercase tracking-wide text-slate-500">
              Recipients
            </label>
            {eligibleContacts.length === 0 ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No contacts with email on file. Reveal a decision-maker first.
              </div>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {eligibleContacts.map((c) => {
                  const key = contactRowKey(c);
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(key)}
                        onChange={() => toggleContact(key)}
                      />
                      <span className="font-body truncate">
                        {c.full_name || c.email}
                        {c.title ? ` — ${c.title}` : ""}
                      </span>
                    </li>
                  );
                })}
                {contacts.length > eligibleContacts.length && (
                  <li className="font-body text-xs text-slate-400">
                    {contacts.length - eligibleContacts.length} contact(s) without email — skipped
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="font-display rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={!canLaunch}
            className="font-display rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Starting…" : "Start outreach"}
          </button>
        </div>
      </div>
    </div>
  );
}
