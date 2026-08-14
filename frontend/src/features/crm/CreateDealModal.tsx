"use client";

import React, { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  type DealStage,
  createDeal,
  listOrgMembers,
  listCompanyContacts,
  currentUserId,
} from "@/api/crm";

const FONT_HEAD = "'Space Grotesk', sans-serif";

export type CreateDealPrefill = {
  savedCompanyId?: string | null;
  companyKey?: string | null;   // source_company_key
  companyUuid?: string | null;  // lit_companies.id (for contact lookup)
  companyName?: string | null;
};

/**
 * Create-deal modal. Used standalone (New deal button on the board) and
 * prefilled from a saved company (Command Center row / company profile).
 */
export default function CreateDealModal({
  stages,
  prefill,
  onClose,
  onCreated,
}: {
  stages: DealStage[];
  prefill?: CreateDealPrefill;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(prefill?.companyName ? `${prefill.companyName} — new opportunity` : "");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [closeDate, setCloseDate] = useState("");
  const [contactId, setContactId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [members, setMembers] = useState<Array<{ user_id: string; name: string }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; full_name: string; title: string | null }>>([]);

  useEffect(() => {
    (async () => {
      const [m, uid, c] = await Promise.all([
        listOrgMembers(),
        currentUserId(),
        prefill?.companyUuid ? listCompanyContacts(prefill.companyUuid) : Promise.resolve([]),
      ]);
      setMembers(m);
      if (uid) setOwnerId(uid);
      setContacts(c as any);
      if ((c as any[])?.length === 1) setContactId((c as any[])[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!stageId) {
      toast({ title: "No pipeline stage available", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createDeal({
        title: title.trim(),
        stage_id: stageId,
        saved_company_id: prefill?.savedCompanyId ?? null,
        company_id: prefill?.companyKey ?? null,
        value_amount: value.trim() === "" ? null : Number(value),
        expected_close_date: closeDate || null,
        primary_contact_id: contactId || null,
        owner_user_id: ownerId || null,
      });
      toast({ title: "Deal created" });
      onCreated();
      onClose();
    } catch (e: any) {
      toast({ title: "Could not create deal", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", width: "min(460px, 100%)", background: "#FFFFFF", borderRadius: 16, boxShadow: "0 20px 50px rgba(15,23,42,0.25)", overflow: "hidden" }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>New deal</div>
          <button onClick={onClose} style={iconBtn} title="Close">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {prefill?.companyName ? (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#64748b" }}>
              For <b style={{ color: "#0F172A" }}>{prefill.companyName}</b>
            </div>
          ) : null}

          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title" style={inputStyle} autoFocus />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Value (USD)">
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" style={inputStyle} />
            </Field>
            <Field label="Stage">
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={inputStyle}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Expected close">
              <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Owner">
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={inputStyle}>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {contacts.length > 0 ? (
            <Field label="Primary contact">
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={inputStyle}>
                <option value="">— none —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.title ? ` · ${c.title}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving} style={primaryBtn}>
            {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
            Create deal
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1.5px solid #CBD5E1",
  background: "#FFFFFF",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  color: "#0F172A",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: 10,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  fontFamily: FONT_HEAD,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 10,
  border: "1.5px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#475569",
  fontFamily: FONT_HEAD,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: "#64748b",
  cursor: "pointer",
};
