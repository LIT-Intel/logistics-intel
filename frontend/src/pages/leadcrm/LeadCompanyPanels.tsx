"use client";

/**
 * Lead-CRM Phase 2 — Company Intelligence + Contacts panels for the lead drawer.
 *
 * Reuses:
 *   - CompanyAvatar (frontend/src/components/CompanyAvatar.tsx) → the shared
 *     logo.dev resolution (getLogoCandidates in @/lib/logo, token + Clearbit +
 *     unavatar cascade + initials fallback). Same resolver the shipper cards use.
 *   - lit_leadcrm_company_snapshot / lit_leadcrm_lead_contacts (cached, 0 credits)
 *   - lead-crm-enrich-contacts edge fn (Apollo path; metered + quota-gated)
 *
 * Honest empty states everywhere: "company not recognized", "no shipment data",
 * "no contacts yet". No fabricated data.
 */
import React, { useEffect, useState } from "react";
import {
  Loader2,
  ExternalLink,
  Ship,
  Container,
  MapPin,
  Sparkles,
  Mail,
  Phone,
  Linkedin,
  UserPlus,
  Building2,
  RefreshCw,
  Check,
  Save,
} from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useToast } from "@/components/ui/use-toast";
import {
  type Lead,
  type LeadCompanySnapshot,
  type LeadContact,
  getCompanySnapshot,
  getLeadContacts,
  enrichLeadContacts,
  recognizeCompany,
  getSavedContactIds,
  saveLeadContacts,
} from "@/api/leadCrm";
import { FONT_HEAD, FONT_BODY, FONT_MONO, asText } from "./leadCrmFormat";

function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1000) return Math.round(n).toLocaleString();
  return String(Math.round(n));
}

// ── Company Intelligence panel ──────────────────────────────────────────────

export function CompanyPanel({ lead, onRecognized }: { lead: Lead; onRecognized: () => void }) {
  const { toast } = useToast();
  const [snap, setSnap] = useState<LeadCompanySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [recognizing, setRecognizing] = useState(false);

  const recognized = Boolean(lead.company_id || lead.company_domain || lead.company_city);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const s = recognized ? await getCompanySnapshot(lead.id) : null;
      if (!alive) return;
      setSnap(s);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [lead.id, recognized]);

  async function handleRecognize() {
    setRecognizing(true);
    try {
      const r = await recognizeCompany(lead.id);
      if (r.ok && r.recognized) {
        toast({ title: "Company recognized" });
        onRecognized();
      } else {
        toast({ title: "No confident company match", description: "Left unrecognized — no data was guessed." });
      }
    } catch (e: any) {
      toast({ title: "Recognition failed", description: e?.message, variant: "destructive" });
    } finally {
      setRecognizing(false);
    }
  }

  const locationBits = [lead.company_city, lead.company_state, lead.company_country].filter(Boolean);
  const displayName = snap?.company_name || lead.company_name || "Unknown company";

  return (
    <Panel
      title="Company"
      action={
        recognized ? (
          <button onClick={handleRecognize} disabled={recognizing} style={miniBtn} title="Re-run recognition">
            {recognizing ? <Loader2 style={spin14} /> : <RefreshCw style={{ width: 12, height: 12 }} />}
            Re-check
          </button>
        ) : null
      }
    >
      {!recognized ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <EmptyRow
            icon={<Building2 style={{ width: 16, height: 16 }} />}
            title="Company not recognized"
            detail={
              lead.company_name
                ? `No confident match for "${lead.company_name}".`
                : "This lead has no company name or corporate domain to match."
            }
          />
          <button onClick={handleRecognize} disabled={recognizing} style={primaryMini}>
            {recognizing ? <Loader2 style={spin14} /> : <Sparkles style={{ width: 13, height: 13 }} />}
            Recognize company
          </button>
        </div>
      ) : (
        <>
          {/* Identity row */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <CompanyAvatar
              name={displayName}
              domain={lead.company_domain}
              logoUrl={lead.company_logo_url}
              size="lg"
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {asText(displayName)}
              </div>
              {locationBits.length > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT_BODY, fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  <MapPin style={{ width: 12, height: 12 }} />
                  {asText(locationBits.join(", "))}
                </div>
              ) : null}
              {lead.company_domain ? (
                <a href={`https://${lead.company_domain}`} target="_blank" rel="noreferrer" style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: "#2563eb", textDecoration: "none" }}>
                  {asText(lead.company_domain)}
                </a>
              ) : null}
            </div>
          </div>

          {/* Snapshot metrics */}
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontFamily: FONT_BODY, fontSize: 12, padding: "8px 0" }}>
              <Loader2 style={spin14} /> Loading shipment data…
            </div>
          ) : snap?.has_snapshot ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                <Metric icon={<Ship style={m14} />} label="Est. 12m shipments" value={fmtNum(snap.shipments_12m)} />
                <Metric icon={<Container style={m14} />} label="Total TEU" value={fmtNum(snap.total_teu)} />
              </div>
              {snap.top_lane ? <KeyVal label="Lead lane" value={asText(snap.top_lane)} /> : null}
              {snap.top_origin_countries.length > 0 ? (
                <KeyVal label="Top origins" value={asText(snap.top_origin_countries.slice(0, 3))} />
              ) : null}
              {snap.top_us_ports.length > 0 ? (
                <KeyVal label="Top US ports" value={asText(snap.top_us_ports.slice(0, 3))} />
              ) : null}
              {snap.monthly_trend.length > 1 ? <MiniTrend data={snap.monthly_trend} /> : null}
              {snap.profile_href ? (
                <a href={snap.profile_href} style={profileLink}>
                  View full profile <ExternalLink style={{ width: 12, height: 12 }} />
                </a>
              ) : null}
            </>
          ) : (
            <EmptyRow
              icon={<Ship style={{ width: 16, height: 16 }} />}
              title="No shipment data"
              detail="Recognized from directory/domain, but no ImportYeti snapshot is cached for this company."
            />
          )}
        </>
      )}
    </Panel>
  );
}

// ── Contacts panel ──────────────────────────────────────────────────────────

export function ContactsPanel({ lead, onChanged }: { lead: Lead; onChanged?: () => void }) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [companyLinked, setCompanyLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const { companyLinked: linked, contacts: rows } = await getLeadContacts(lead.id);
    setCompanyLinked(linked);
    setContacts(rows);
    setSavedIds(await getSavedContactIds(rows.map((contact) => contact.id)));
    setSelected(new Set());
    setLoading(false);
  }

  async function handleSaveSelected() {
    const rows = contacts.filter((contact) => selected.has(contact.id) && !savedIds.has(contact.id));
    if (!rows.length) return;
    setSaving(true);
    try {
      await saveLeadContacts(rows, lead.company_id);
      setSavedIds((current) => new Set([...current, ...rows.map((contact) => contact.id)]));
      setSelected(new Set());
      toast({
        title: `Saved ${rows.length} contact${rows.length === 1 ? "" : "s"}`,
        description: "Saved contacts remain linked to this company and its tags for segmentation and reporting.",
      });
    } catch (e: any) {
      toast({ title: "Could not save contacts", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { companyLinked: linked, contacts: rows } = await getLeadContacts(lead.id);
      if (!alive) return;
      setCompanyLinked(linked);
      setContacts(rows);
      setSavedIds(await getSavedContactIds(rows.map((contact) => contact.id)));
      setSelected(new Set());
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [lead.id]);

  async function handleEnrich() {
    setEnriching(true);
    try {
      const res = await enrichLeadContacts(lead.id);
      if (res.ok) {
        toast({
          title: res.count ? `Enriched ${res.count} contact${res.count === 1 ? "" : "s"}` : "No new contacts found",
          description: res.credits_note,
        });
        await load();
        onChanged?.();
      } else {
        toast({
          title: "Enrichment unavailable",
          description:
            res.code === "COMPANY_NOT_RECOGNIZED"
              ? "Add a company name or website first (Edit details)."
              : res.error || "Try again later.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Enrichment failed", description: e?.message, variant: "destructive" });
    } finally {
      setEnriching(false);
    }
  }

  // Enrich is unblocked once the lead has ANY company identity: a recognized
  // company_id, a (manually-entered/derived) domain, OR a company name.
  const canEnrich = Boolean(lead.company_id || lead.company_domain || lead.company_name);
  const companyLabel = lead.company_name || lead.company_domain || "this company";

  return (
    <Panel
      title="Contacts"
      action={
        <button
          onClick={handleEnrich}
          disabled={enriching || !canEnrich}
          style={primaryMini}
          title={canEnrich ? "Enrich via Apollo (uses credits)" : "Add a company name or website first"}
        >
          {enriching ? <Loader2 style={spin14} /> : <UserPlus style={{ width: 13, height: 13 }} />}
          Enrich contacts
        </button>
      }
    >
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontFamily: FONT_BODY, fontSize: 12, padding: "6px 0" }}>
          <Loader2 style={spin14} /> Loading contacts…
        </div>
      ) : !companyLinked ? (
        <EmptyRow
          icon={<Mail style={{ width: 16, height: 16 }} />}
          title="No contacts yet"
          detail={
            canEnrich
              ? `Enrich to find contacts at ${companyLabel}.`
              : "Add a company name or website (Edit details) to enrich its contacts."
          }
        />
      ) : contacts.length === 0 ? (
        <EmptyRow
          icon={<Mail style={{ width: 16, height: 16 }} />}
          title="No contacts yet"
          detail='Use "Enrich contacts" to discover key people at this company (uses credits).'
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT_BODY, fontSize: 11.5, color: "#64748b", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={contacts.some((contact) => !savedIds.has(contact.id)) && contacts.filter((contact) => !savedIds.has(contact.id)).every((contact) => selected.has(contact.id))}
                onChange={(event) => setSelected(event.target.checked ? new Set(contacts.filter((contact) => !savedIds.has(contact.id)).map((contact) => contact.id)) : new Set())}
              />
              Select unsaved
            </label>
            <button onClick={handleSaveSelected} disabled={saving || selected.size === 0} style={{ ...primaryMini, opacity: saving || selected.size === 0 ? 0.55 : 1 }}>
              {saving ? <Loader2 style={spin14} /> : <Save style={{ width: 13, height: 13 }} />}
              Save selected ({selected.size})
            </button>
          </div>
          {contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              selected={selected.has(contact.id)}
              saved={savedIds.has(contact.id)}
              onToggle={() => setSelected((current) => {
                const next = new Set(current);
                if (next.has(contact.id)) next.delete(contact.id); else next.add(contact.id);
                return next;
              })}
            />
          ))}
        </div>
      )}
      {canEnrich ? (
        <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: "#94a3b8", marginTop: 4 }}>
          Enrichment consumes contact-enrichment credits (metered against your plan).
        </div>
      ) : null}
    </Panel>
  );
}

function ContactCard({ contact, selected, saved, onToggle }: { contact: LeadContact; selected: boolean; saved: boolean; onToggle: () => void }) {
  const name = contact.full_name || "Unknown contact";
  return (
    <div style={{ border: `1px solid ${selected ? "#3B82F6" : "#E5E7EB"}`, borderRadius: 10, padding: "9px 11px", background: selected ? "#EFF6FF" : "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <input type="checkbox" checked={selected || saved} disabled={saved} onChange={onToggle} aria-label={`Select ${name}`} />
          <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {asText(name)}
          </div>
          {contact.title ? (
            <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {asText(contact.title)}
            </div>
          ) : null}
          </div>
        </div>
        {saved ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#15803d", fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700 }}>
            <Check style={{ width: 13, height: 13 }} /> Saved
          </span>
        ) : contact.linkedin_url ? (
          <a href={contact.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "#0a66c2", flexShrink: 0 }}>
            <Linkedin style={{ width: 15, height: 15 }} />
          </a>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
        {contact.email ? (
          <span style={contactMeta}>
            <Mail style={{ width: 12, height: 12 }} /> {asText(contact.email)}
          </span>
        ) : null}
        {contact.phone ? (
          <span style={contactMeta}>
            <Phone style={{ width: 12, height: 12 }} /> {asText(contact.phone)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ── Mini bar-chart trend ────────────────────────────────────────────────────

function MiniTrend({ data }: { data: { month: string; shipments: number }[] }) {
  const pts = data.slice(-12);
  const max = Math.max(1, ...pts.map((p) => p.shipments));
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 5 }}>
        Monthly shipments
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34 }}>
        {pts.map((p) => (
          <div
            key={p.month}
            title={`${p.month}: ${Math.round(p.shipments)}`}
            style={{
              flex: 1,
              height: `${Math.max(4, (p.shipments / max) * 100)}%`,
              background: "linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)",
              borderRadius: 2,
              minWidth: 3,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────────────────────

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b" }}>
          {title}
        </div>
        {action}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #EEF2F7", borderRadius: 10, padding: "8px 10px", background: "#F8FAFC" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#64748b" }}>
        {icon}
        <span style={{ fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: "#0F172A", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function KeyVal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>{label}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: "#334155", marginTop: 1, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function EmptyRow({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: "#F1F5F9", color: "#94a3b8", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: "#475569" }}>{title}</div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>{detail}</div>
      </div>
    </div>
  );
}

const m14: React.CSSProperties = { width: 13, height: 13 };
const spin14: React.CSSProperties = { width: 14, height: 14, animation: "spin 1s linear infinite" };

const contactMeta: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontFamily: FONT_BODY,
  fontSize: 11.5,
  color: "#475569",
};

const profileLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontFamily: FONT_HEAD,
  fontSize: 12,
  fontWeight: 600,
  color: "#2563eb",
  textDecoration: "none",
  marginTop: 2,
};

const miniBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: "#64748b",
  fontFamily: FONT_HEAD,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryMini: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 11px",
  borderRadius: 9,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  fontFamily: FONT_HEAD,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
