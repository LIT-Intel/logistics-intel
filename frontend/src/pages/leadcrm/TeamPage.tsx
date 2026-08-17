"use client";

/**
 * Team / member management — how the platform admin grants reps access to the
 * shared Lead CRM. Visible only when `access.is_platform_admin` (the nav item
 * is hidden otherwise, and every RPC re-checks server-side).
 *
 * Restyled to the new full-width, dense, themed shell: the add-member search
 * picker logic is UNCHANGED (searchUsers → setMember), only the chrome is new,
 * and members render as a clean full-width table (avatar, name/email, role
 * select, added date, revoke). Reads all colors from the active theme tokens.
 */
import React, { useEffect, useState } from "react";
import { UserPlus, Loader2, ShieldCheck, Trash2, Users, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { useLeadCrmAccess } from "@/hooks/useLeadCrmAccess";
import {
  type LeadCrmMember,
  type CrmUserSearchResult,
  listMembers,
  setMember,
  searchUsers,
} from "@/api/leadCrm";
import { FONT_HEAD, FONT_BODY, formatDate, initials, avatarColor, asText } from "./leadCrmFormat";
import { useLeadCrmTheme } from "./LeadCrmTheme";

export default function TeamPage() {
  const { toast } = useToast();
  const { theme } = useLeadCrmTheme();
  const { isPlatformAdmin, loading: accessLoading } = useLeadCrmAccess();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [picked, setPicked] = useState<CrmUserSearchResult | null>(null);
  const [newRole, setNewRole] = useState<"rep" | "manager">("rep");
  const [adding, setAdding] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  // Debounce the search box → user-search RPC.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: candidates = [] } = useQuery<CrmUserSearchResult[]>({
    queryKey: ["lead-crm", "user-search", debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: isPlatformAdmin && debouncedQuery.length >= 2 && !picked,
    staleTime: 15_000,
  });

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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${theme.borderStrong}`,
    background: theme.inputBg, fontFamily: FONT_BODY, fontSize: 13, color: theme.text, outline: "none",
  };
  const primaryBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
    border: "none", background: theme.accent, color: theme.accentText, fontFamily: FONT_HEAD,
    fontSize: 13, fontWeight: 600, cursor: "pointer",
  };

  if (!accessLoading && !isPlatformAdmin) {
    return (
      <div style={{ flex: 1, background: theme.bg, padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: theme.heading }}>
          Team management is admin-only
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
          Only Logistics Intel platform admins can manage Lead CRM members.
        </div>
      </div>
    );
  }

  async function handleAdd() {
    if (!picked || picked.is_member) return;
    setAdding(true);
    try {
      await setMember(picked.user_id, true, newRole);
      const label = picked.full_name || picked.email || "Member";
      setPicked(null);
      setQuery("");
      setDebouncedQuery("");
      toast({ title: `${label} added to the Lead CRM` });
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
    <div style={{ flex: 1, overflowY: "auto", background: theme.bg }}>
      <div style={{ padding: "20px 24px 48px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: theme.accent, letterSpacing: "0.22em", textTransform: "uppercase" }}>
              Workspace access
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: theme.heading, letterSpacing: "-0.02em", marginTop: 3 }}>
              Team
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
              Grant reps and managers access to the shared Lead CRM.
            </div>
          </div>
        </div>

        {/* Add member — search existing users, pick by name/email (no UUIDs) */}
        <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, marginBottom: 18 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: theme.textMuted, marginBottom: 12 }}>
            Add member
          </div>

          {picked ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 220, padding: "7px 10px", border: `1.5px solid ${theme.borderStrong}`, borderRadius: 8, background: theme.panelAlt }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: avatarColor(picked.full_name || picked.email || ""), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {initials(picked.full_name || picked.email || "?")}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asText(picked.full_name) || asText(picked.email)}
                  </div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: theme.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asText(picked.email)}{picked.is_member ? " · already a member" : ""}
                  </div>
                </div>
                <button onClick={() => setPicked(null)} title="Change" style={{ border: "none", background: "transparent", cursor: "pointer", color: theme.textFaint, flexShrink: 0, lineHeight: 0 }}>
                  <X style={{ width: 15, height: 15 }} />
                </button>
              </div>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as "rep" | "manager")} style={{ ...inputStyle, width: 130 }}>
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
              </select>
              <button onClick={handleAdd} disabled={adding || picked.is_member} style={{ ...primaryBtn, opacity: picked.is_member ? 0.5 : 1 }}>
                {adding ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <UserPlus style={{ width: 14, height: 14 }} />}
                {picked.is_member ? "Already added" : "Add"}
              </button>
            </div>
          ) : (
            <div style={{ position: "relative", maxWidth: 560 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1.5px solid ${theme.borderStrong}`, borderRadius: 8, padding: "0 10px", background: theme.inputBg }}>
                <Search style={{ width: 15, height: 15, color: theme.textFaint, flexShrink: 0 }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your team by name or email…"
                  autoFocus
                  style={{ ...inputStyle, border: "none", padding: "9px 0", background: "transparent" }}
                />
              </div>
              {debouncedQuery.length >= 2 ? (
                <>
                  <div onClick={() => setQuery("")} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: `0 8px 24px ${theme.shadow}`, maxHeight: 300, overflowY: "auto" }}>
                    {candidates.length === 0 ? (
                      <div style={{ padding: "14px 12px", fontFamily: FONT_BODY, fontSize: 12.5, color: theme.textFaint }}>
                        No users match that search.
                      </div>
                    ) : (
                      candidates.map((u) => {
                        const nm = u.full_name || (u.email ? u.email.split("@")[0] : "User");
                        return (
                          <button
                            key={u.user_id}
                            onClick={() => { setPicked(u); setQuery(""); }}
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", border: "none", borderBottom: `1px solid ${theme.border}`, background: theme.panel, cursor: "pointer", textAlign: "left" }}
                          >
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: avatarColor(nm), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {initials(nm)}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asText(nm)}</div>
                              <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: theme.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {asText(u.email)}{u.company_name ? ` · ${asText(u.company_name)}` : ""}
                              </div>
                            </div>
                            {u.is_member ? (
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: theme.success, background: theme.successSoft, border: `1px solid ${theme.success}`, borderRadius: 999, padding: "1px 7px", fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Member</span>
                            ) : u.is_platform_admin ? (
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: theme.accentSoftText, background: theme.accentSoft, border: `1px solid ${theme.accentBorder}`, borderRadius: 999, padding: "1px 7px", fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>Admin</span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
          <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textFaint, marginTop: 8 }}>
            Search your existing users and pick one — they get Lead CRM access at{" "}
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>/app/leads</span> on next load. Suspended accounts are hidden.
          </div>
        </div>

        {/* Members table */}
        <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: theme.textMuted, padding: "14px 16px 10px" }}>
            Members {members.length ? `(${members.length})` : ""}
          </div>
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: theme.textMuted, fontFamily: FONT_BODY, fontSize: 13 }}>
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
              Loading members…
            </div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: theme.panelMuted, marginBottom: 12 }}>
                <Users style={{ width: 20, height: 20, color: theme.textFaint }} />
              </div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: theme.heading }}>No members yet</div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>
                Add a rep above to get the team started.
              </div>
            </div>
          ) : (
            <div>
              {/* Column header row */}
              <div className="hidden md:flex" style={{ alignItems: "center", gap: 12, padding: "8px 16px", borderTop: `1px solid ${theme.border}`, background: theme.panelAlt }}>
                <span style={{ ...colHead(theme), flex: 1 }}>Member</span>
                <span style={{ ...colHead(theme), width: 130 }}>Role</span>
                <span style={{ ...colHead(theme), width: 120 }}>Added</span>
                <span style={{ ...colHead(theme), width: 34, textAlign: "right" }} />
              </div>
              {members.map((m) => {
                const name = m.full_name || (m.email ? m.email.split("@")[0] : "Member");
                const busy = busyUser === m.user_id;
                return (
                  <div
                    key={m.user_id}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: `1px solid ${theme.border}`, flexWrap: "wrap" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: avatarColor(name), color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {initials(name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: theme.heading, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {asText(name)}
                          </span>
                          {m.enabled === false ? (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: theme.danger, background: theme.dangerSoft, border: `1px solid ${theme.dangerBorder}`, borderRadius: 999, padding: "1px 7px", fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              Revoked
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: theme.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {asText(m.email) || asText(m.user_id)}
                        </div>
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
                    <span style={{ width: 120, fontFamily: FONT_BODY, fontSize: 12, color: theme.textMuted }}>
                      {m.added_at ? asText(formatDate(m.added_at)) : "—"}
                    </span>
                    <button
                      onClick={() => handleRevoke(m)}
                      disabled={busy}
                      title="Revoke access"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34,
                        borderRadius: 8, border: `1.5px solid ${theme.dangerBorder}`, background: theme.panel,
                        color: theme.danger, cursor: busy ? "not-allowed" : "pointer", flexShrink: 0,
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

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, color: theme.textFaint, fontFamily: FONT_BODY, fontSize: 11.5 }}>
          <ShieldCheck style={{ width: 13, height: 13 }} />
          Access is enforced server-side — this panel only sends grant/revoke requests.
        </div>
      </div>
    </div>
  );
}

function colHead(theme: ReturnType<typeof useLeadCrmTheme>["theme"]): React.CSSProperties {
  return {
    fontFamily: FONT_HEAD, fontSize: 9, fontWeight: 700, letterSpacing: "0.09em",
    textTransform: "uppercase", color: theme.textFaint,
  };
}
