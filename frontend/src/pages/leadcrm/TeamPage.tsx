"use client";

/**
 * Team / member management — how the platform admin grants reps access to the
 * shared Lead CRM. Visible only when `access.is_platform_admin` (the nav tab
 * is hidden otherwise, and every RPC re-checks server-side).
 *
 * Lists current members (lit_admin_list_lead_crm_members) and lets the admin
 * add a member by user id + role, toggle a member's role, or revoke access
 * (lit_admin_set_lead_crm_member with p_enabled=false). Kept intentionally
 * simple — this is the owner's grant surface, not a full IAM console.
 */
import React, { useState } from "react";
import { UserPlus, Loader2, ShieldCheck, Trash2, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { useLeadCrmAccess } from "@/hooks/useLeadCrmAccess";
import {
  type LeadCrmMember,
  listMembers,
  setMember,
} from "@/api/leadCrm";
import { FONT_HEAD, FONT_BODY, formatDate, initials, avatarColor } from "./leadCrmFormat";

export default function TeamPage() {
  const { toast } = useToast();
  const { isPlatformAdmin, loading: accessLoading } = useLeadCrmAccess();

  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<"rep" | "manager">("rep");
  const [adding, setAdding] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const {
    data: members = [],
    isLoading,
    refetch,
  } = useQuery<LeadCrmMember[]>({
    queryKey: ["lead-crm", "members"],
    queryFn: listMembers,
    enabled: isPlatformAdmin,
    staleTime: 30_000,
  });

  // Belt-and-braces: the tab is already admin-gated, but guard the page too so
  // a direct URL hit by a rep renders a clean message, not the admin surface.
  if (!accessLoading && !isPlatformAdmin) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
          Team management is admin-only
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Only Logistics Intel platform admins can manage Lead CRM members.
        </div>
      </div>
    );
  }

  async function handleAdd() {
    const uid = newUserId.trim();
    if (!uid) return;
    setAdding(true);
    try {
      await setMember(uid, true, newRole);
      setNewUserId("");
      toast({ title: "Member added" });
      await refetch();
    } catch (e: any) {
      toast({ title: "Could not add member", description: e?.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleRole(m: LeadCrmMember, role: "rep" | "manager") {
    setBusyUser(m.user_id);
    try {
      await setMember(m.user_id, true, role);
      await refetch();
    } catch (e: any) {
      toast({ title: "Could not update role", description: e?.message, variant: "destructive" });
    } finally {
      setBusyUser(null);
    }
  }

  async function handleRevoke(m: LeadCrmMember) {
    if (!window.confirm(`Remove ${m.full_name || m.email || "this member"} from the Lead CRM?`)) return;
    setBusyUser(m.user_id);
    try {
      await setMember(m.user_id, false, null);
      toast({ title: "Access revoked" });
      await refetch();
    } catch (e: any) {
      toast({ title: "Could not revoke", description: e?.message, variant: "destructive" });
    } finally {
      setBusyUser(null);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#F8FAFC" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 48px" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
            Team
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", marginTop: 2 }}>
            Grant reps and managers access to the shared Lead CRM.
          </div>
        </div>

        {/* Add member */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 18 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", marginBottom: 12 }}>
            Add member
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 220 }}>
              <span style={fieldLabel}>User ID</span>
              <input
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="auth user UUID"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, width: 140 }}>
              <span style={fieldLabel}>Role</span>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as "rep" | "manager")} style={inputStyle}>
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
              </select>
            </label>
            <button onClick={handleAdd} disabled={adding || !newUserId.trim()} style={primaryBtn}>
              {adding ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <UserPlus style={{ width: 14, height: 14 }} />}
              Add
            </button>
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: "#94a3b8", marginTop: 8 }}>
            Paste the rep's auth user ID. They'll get access to the Lead CRM at{" "}
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>/app/leads</span> on next load.
          </div>
        </div>

        {/* Members list */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", padding: "14px 16px 10px" }}>
            Members {members.length ? `(${members.length})` : ""}
          </div>
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: "#64748b", fontFamily: FONT_BODY, fontSize: 13 }}>
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
              Loading members…
            </div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "#F1F5F9", marginBottom: 12 }}>
                <Users style={{ width: 20, height: 20, color: "#94a3b8" }} />
              </div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: "#0F172A" }}>No members yet</div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: "#64748b", marginTop: 2 }}>
                Add a rep above to get the team started.
              </div>
            </div>
          ) : (
            <div>
              {members.map((m) => {
                const name = m.full_name || (m.email ? m.email.split("@")[0] : "Member");
                const busy = busyUser === m.user_id;
                return (
                  <div
                    key={m.user_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      borderTop: "1px solid #F1F5F9",
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: avatarColor(name), color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {initials(name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name}
                        </span>
                        {m.enabled === false ? (
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#b91c1c", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 999, padding: "1px 7px", fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Revoked
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.email || m.user_id}
                        {m.added_at ? ` · added ${formatDate(m.added_at)}` : ""}
                      </div>
                    </div>
                    <select
                      value={m.role === "manager" ? "manager" : "rep"}
                      onChange={(e) => handleRole(m, e.target.value as "rep" | "manager")}
                      disabled={busy}
                      style={{ ...inputStyle, width: 130 }}
                      title="Change role"
                    >
                      <option value="rep">Rep</option>
                      <option value="manager">Manager</option>
                    </select>
                    <button
                      onClick={() => handleRevoke(m)}
                      disabled={busy}
                      title="Revoke access"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        border: "1.5px solid #FECACA",
                        background: "#FFFFFF",
                        color: "#dc2626",
                        cursor: busy ? "not-allowed" : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Trash2 style={{ width: 14, height: 14 }} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, color: "#94a3b8", fontFamily: FONT_BODY, fontSize: 11.5 }}>
          <ShieldCheck style={{ width: 13, height: 13 }} />
          Access is enforced server-side — this panel only sends grant/revoke requests.
        </div>
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  fontFamily: FONT_HEAD,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#94a3b8",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
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
  padding: "9px 16px",
  borderRadius: 10,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  fontFamily: FONT_HEAD,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
