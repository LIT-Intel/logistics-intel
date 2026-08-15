"use client";

/**
 * Lead-CRM Phase 3 — Communication & Nurture panel (lives in the lead drawer).
 *
 * Lets a team member email, invite, enrol, and book a call for a lead without
 * leaving the CRM. Every action REUSES an existing LIT comms system and logs to
 * the lead timeline (the drawer re-reads the timeline via onLogged()):
 *   - Send email      → lead-crm-send-email edge fn (Resend) → kind='email_sent'
 *   - Email threads    → lit_leadcrm_lead_threads (read-only inbox mirror)
 *   - Send demo invite → send-demo-invite edge fn → kind='demo_invite_sent'
 *   - Add to campaign  → lit_leadcrm_add_to_campaign → kind='added_to_campaign'
 *   - Book a call      → Cal.com link (prefilled) → kind='call_booking_opened'
 *
 * asText() guards every rendered RPC/edge value (owner's React-#31 pain).
 * Honest empty/degraded states throughout (no email, Gmail CASA, cal unset).
 */
import React, { useEffect, useState } from "react";
import {
  Mail,
  Send,
  Loader2,
  Presentation,
  Megaphone,
  CalendarClock,
  Inbox,
  ExternalLink,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  type Lead,
  type LeadEmailInfo,
  type LeadThread,
  type LeadCampaign,
  type CalConfig,
  getLeadEmailInfo,
  sendLeadEmail,
  getLeadThreads,
  sendLeadDemoInvite,
  listLeadCampaigns,
  addLeadToCampaign,
  getCalConfig,
  setCalUrl,
  logCallBookingOpened,
} from "@/api/leadCrm";
import { FONT_HEAD, FONT_BODY, asText, formatRelative, leadDisplayName } from "./leadCrmFormat";

// Local style atoms (mirror the drawer's visual language).
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1.5px solid #CBD5E1",
  background: "#FFFFFF",
  fontFamily: FONT_BODY,
  fontSize: 13,
  color: "#0F172A",
  outline: "none",
};
const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  fontFamily: FONT_HEAD,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1.5px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#475569",
  fontFamily: FONT_HEAD,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
const spinIcon: React.CSSProperties = { width: 14, height: 14, animation: "spin 1s linear infinite" };

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {icon}
        <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b" }}>
          {title}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Hint({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        fontFamily: FONT_BODY,
        fontSize: 11.5,
        color: warn ? "#B45309" : "#94a3b8",
        background: warn ? "#FFFBEB" : "transparent",
        border: warn ? "1px solid #FDE68A" : "none",
        borderRadius: warn ? 8 : 0,
        padding: warn ? "7px 9px" : 0,
      }}
    >
      {warn ? <AlertTriangle style={{ width: 12, height: 12, marginTop: 1, flexShrink: 0 }} /> : null}
      <span>{children}</span>
    </div>
  );
}

export default function LeadCommunicationPanel({
  lead,
  onLogged,
}: {
  lead: Lead;
  onLogged: () => void;
}) {
  const { toast } = useToast();
  const [emailInfo, setEmailInfo] = useState<LeadEmailInfo | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const info = await getLeadEmailInfo(lead.id);
      if (alive) setEmailInfo(info);
    })();
    return () => {
      alive = false;
    };
  }, [lead.id]);

  const hasEmail = Boolean(emailInfo?.has_email);
  const suppressed = Boolean(emailInfo?.suppressed);
  const email = emailInfo?.email ?? lead.email ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SendEmailBlock
        lead={lead}
        hasEmail={hasEmail}
        suppressed={suppressed}
        suppressedReason={emailInfo?.suppressed_reason ?? null}
        onLogged={onLogged}
        toast={toast}
      />
      <ThreadsBlock lead={lead} />
      <DemoInviteBlock lead={lead} email={email} hasEmail={hasEmail} onLogged={onLogged} toast={toast} />
      <CampaignBlock lead={lead} hasEmail={hasEmail} onLogged={onLogged} toast={toast} />
      <BookCallBlock lead={lead} email={email} onLogged={onLogged} toast={toast} />
    </div>
  );
}

// ── 1. Send email ────────────────────────────────────────────────────────────
function SendEmailBlock({
  lead,
  hasEmail,
  suppressed,
  suppressedReason,
  onLogged,
  toast,
}: {
  lead: Lead;
  hasEmail: boolean;
  suppressed: boolean;
  suppressedReason: string | null;
  onLogged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [subject, setSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [busy, setBusy] = useState(false);
  const disabled = !hasEmail || suppressed;

  async function handleSend() {
    if (busy || !subject.trim() || !msgBody.trim()) return;
    setBusy(true);
    try {
      const res = await sendLeadEmail({ leadId: lead.id, subject: subject.trim(), body: msgBody.trim() });
      if (!res.ok) {
        toast({
          title: "Could not send",
          description: asText(res.error) || "Send failed",
          variant: "destructive",
        });
        return;
      }
      setSubject("");
      setMsgBody("");
      toast({ title: "Email sent" });
      onLogged();
    } catch (e: any) {
      toast({ title: "Could not send", description: asText(e?.message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Send email" icon={<Mail style={{ width: 13, height: 13, color: "#64748b" }} />}>
      {!hasEmail ? (
        <Hint>Enrich to get an email first.</Hint>
      ) : suppressed ? (
        <Hint warn>
          {asText(lead.email)} is {asText(suppressedReason) || "suppressed"} — sending is blocked to respect
          unsubscribe/bounce.
        </Hint>
      ) : (
        <Hint>Sends a branded email to {asText(lead.email)} and logs it to the timeline.</Hint>
      )}
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        disabled={disabled}
        style={{ ...inputStyle, opacity: disabled ? 0.6 : 1 }}
      />
      <textarea
        value={msgBody}
        onChange={(e) => setMsgBody(e.target.value)}
        rows={4}
        placeholder="Write your message…"
        disabled={disabled}
        style={{ ...inputStyle, resize: "vertical", opacity: disabled ? 0.6 : 1 }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || busy || !subject.trim() || !msgBody.trim()}
        style={{ ...primaryBtn, alignSelf: "flex-start", opacity: disabled ? 0.5 : 1 }}
      >
        {busy ? <Loader2 style={spinIcon} /> : <Send style={{ width: 14, height: 14 }} />}
        Send email
      </button>
    </Section>
  );
}

// ── 2. Email threads (read-only inbox mirror) ────────────────────────────────
function ThreadsBlock({ lead }: { lead: Lead }) {
  const [loading, setLoading] = useState(true);
  const [hasEmail, setHasEmail] = useState(false);
  const [threads, setThreads] = useState<LeadThread[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await getLeadThreads(lead.id);
      if (!alive) return;
      setHasEmail(res.hasEmail);
      setThreads(res.threads);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [lead.id]);

  return (
    <Section title="Email threads" icon={<Inbox style={{ width: 13, height: 13, color: "#64748b" }} />}>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontFamily: FONT_BODY, fontSize: 12 }}>
          <Loader2 style={spinIcon} /> Loading threads…
        </div>
      ) : threads.length === 0 ? (
        <Hint>
          {!hasEmail
            ? "No email yet — enrich this lead to match inbox threads."
            : "No email threads yet — connect a mailbox in Settings. (Gmail inbound is pending CASA review; Outlook syncs today.)"}
        </Hint>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {threads.map((t) => (
            <div
              key={t.id}
              style={{ padding: "8px 10px", border: "1px solid #EEF2F7", borderRadius: 10, background: "#F8FAFC" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: FONT_HEAD,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#0F172A",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {asText(t.subject) || "(no subject)"}
                </span>
                {t.unread_count && t.unread_count > 0 ? (
                  <span
                    style={{
                      fontFamily: FONT_HEAD,
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: "#1D4ED8",
                      background: "#EFF6FF",
                      border: "1px solid #BFDBFE",
                      borderRadius: 999,
                      padding: "1px 6px",
                    }}
                  >
                    {asText(t.unread_count)} new
                  </span>
                ) : null}
              </div>
              {t.last_snippet ? (
                <div
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 11.5,
                    color: "#64748b",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {asText(t.last_snippet)}
                </div>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontFamily: FONT_BODY, fontSize: 10.5, color: "#94a3b8" }}>
                <span>{asText(formatRelative(t.last_message_at))}</span>
                {t.provider ? <span>· {asText(t.provider)}</span> : null}
                {t.message_count ? <span>· {asText(t.message_count)} msg</span> : null}
              </div>
            </div>
          ))}
          <a
            href="/app/inbox"
            style={{ ...ghostBtn, alignSelf: "flex-start", textDecoration: "none" }}
          >
            <ExternalLink style={{ width: 13, height: 13 }} />
            Open in Inbox
          </a>
        </div>
      )}
    </Section>
  );
}

// ── 3. Send demo invite ──────────────────────────────────────────────────────
function DemoInviteBlock({
  lead,
  email: leadEmail,
  hasEmail,
  onLogged,
  toast,
}: {
  lead: Lead;
  email: string | null;
  hasEmail: boolean;
  onLogged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [busy, setBusy] = useState(false);

  async function handleSend() {
    if (busy || !leadEmail) return;
    setBusy(true);
    try {
      const res = await sendLeadDemoInvite({
        leadId: lead.id,
        email: leadEmail,
        name: lead.full_name,
        company: lead.company_name,
      });
      if (!res.ok) {
        toast({ title: "Could not send invite", description: asText(res.error), variant: "destructive" });
        return;
      }
      toast({ title: "Demo invite sent" });
      onLogged();
    } catch (e: any) {
      toast({ title: "Could not send invite", description: asText(e?.message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Demo invite" icon={<Presentation style={{ width: 13, height: 13, color: "#64748b" }} />}>
      {!hasEmail ? (
        <Hint>Enrich to get an email first.</Hint>
      ) : (
        <Hint>Sends the branded "your LIT access" invite to {asText(leadEmail)} and tracks the funnel.</Hint>
      )}
      <button
        onClick={handleSend}
        disabled={!hasEmail || busy}
        style={{ ...ghostBtn, alignSelf: "flex-start", opacity: !hasEmail ? 0.5 : 1 }}
      >
        {busy ? <Loader2 style={spinIcon} /> : <Presentation style={{ width: 14, height: 14 }} />}
        Send demo invite
      </button>
    </Section>
  );
}

// ── 4. Add to campaign ───────────────────────────────────────────────────────
function CampaignBlock({
  lead,
  hasEmail,
  onLogged,
  toast,
}: {
  lead: Lead;
  hasEmail: boolean;
  onLogged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [campaigns, setCampaigns] = useState<LeadCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const rows = await listLeadCampaigns();
      if (!alive) return;
      setCampaigns(rows);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleAdd() {
    if (busy || !selected) return;
    setBusy(true);
    try {
      const res = await addLeadToCampaign(lead.id, selected);
      if (!res.ok) {
        toast({
          title: "Could not enrol",
          description: res.reason === "no_email" ? "Enrich to get an email first." : asText(res.reason),
          variant: "destructive",
        });
        return;
      }
      toast({ title: res.already_enrolled ? "Already in this campaign" : "Added to campaign" });
      setSelected("");
      onLogged();
    } catch (e: any) {
      toast({ title: "Could not enrol", description: asText(e?.message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Add to campaign" icon={<Megaphone style={{ width: 13, height: 13, color: "#64748b" }} />}>
      {!hasEmail ? (
        <Hint>Enrich to get an email first — campaigns enrol by email.</Hint>
      ) : loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontFamily: FONT_BODY, fontSize: 12 }}>
          <Loader2 style={spinIcon} /> Loading campaigns…
        </div>
      ) : campaigns.length === 0 ? (
        <Hint>No campaigns available to enrol into yet.</Hint>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          >
            <option value="">Choose a campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {asText(c.name) || "Campaign"}
                {c.status ? ` (${asText(c.status)})` : ""}
              </option>
            ))}
          </select>
          <button onClick={handleAdd} disabled={busy || !selected} style={{ ...primaryBtn, opacity: !selected ? 0.5 : 1 }}>
            {busy ? <Loader2 style={spinIcon} /> : <Plus style={{ width: 14, height: 14 }} />}
            Add
          </button>
        </div>
      )}
    </Section>
  );
}

// ── 5. Book a call (Cal.com) ─────────────────────────────────────────────────
function BookCallBlock({
  lead,
  email: leadEmail,
  onLogged,
  toast,
}: {
  lead: Lead;
  email: string | null;
  onLogged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [cfg, setCfg] = useState<CalConfig | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await getCalConfig();
      if (!alive) return;
      setCfg(c);
      setUrlDraft(c.cal_url ?? "");
    })();
    return () => {
      alive = false;
    };
  }, [lead.id]);

  function buildUrl(): string {
    const base = cfg?.cal_url ?? "";
    if (!base) return "";
    const name = leadDisplayName(lead.full_name, leadEmail);
    const params = new URLSearchParams();
    if (leadEmail) params.set("email", leadEmail);
    if (name) params.set("name", name);
    const sep = base.includes("?") ? "&" : "?";
    return params.toString() ? `${base}${sep}${params.toString()}` : base;
  }

  function handleBook() {
    const url = buildUrl();
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    logCallBookingOpened(lead.id).then(() => onLogged());
    toast({ title: "Booking link opened" });
  }

  async function handleSaveUrl() {
    if (savingUrl) return;
    setSavingUrl(true);
    try {
      const res = await setCalUrl(urlDraft.trim());
      if (!res.ok) {
        toast({
          title: "Could not save",
          description: res.reason === "invalid_url" ? "Enter a full https:// URL." : asText(res.reason),
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Cal.com link saved" });
      setCfg((prev) => (prev ? { ...prev, configured: Boolean(res.cal_url), cal_url: res.cal_url ?? null } : prev));
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Could not save", description: asText(e?.message), variant: "destructive" });
    } finally {
      setSavingUrl(false);
    }
  }

  const configured = Boolean(cfg?.configured);
  const canConfigure = Boolean(cfg?.can_configure);

  return (
    <Section title="Book a call" icon={<CalendarClock style={{ width: 13, height: 13, color: "#64748b" }} />}>
      {configured ? (
        <>
          <Hint>Opens your Cal.com link prefilled with the lead's name & email.</Hint>
          <button onClick={handleBook} style={{ ...primaryBtn, alignSelf: "flex-start" }}>
            <CalendarClock style={{ width: 14, height: 14 }} />
            Book a call
          </button>
        </>
      ) : (
        <Hint warn>
          {canConfigure
            ? "Set your Cal.com link in CRM settings to enable booking."
            : "Booking isn't set up yet — ask a platform admin to add the Cal.com link in CRM settings."}
        </Hint>
      )}

      {canConfigure ? (
        editing || !configured ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://cal.com/your-team/15min"
              style={{ ...inputStyle, flex: 1, minWidth: 180 }}
            />
            <button onClick={handleSaveUrl} disabled={savingUrl} style={primaryBtn}>
              {savingUrl ? <Loader2 style={spinIcon} /> : null}
              Save link
            </button>
            {configured ? (
              <button onClick={() => { setEditing(false); setUrlDraft(cfg?.cal_url ?? ""); }} style={ghostBtn}>
                Cancel
              </button>
            ) : null}
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{ ...ghostBtn, alignSelf: "flex-start" }}>
            Edit Cal.com link
          </button>
        )
      ) : null}
    </Section>
  );
}
