// CompaniesSection.tsx — Platform-admin company + user provisioning.
//
// Manual demo-account management: view/add companies (organizations),
// view/add/remove users, change roles and plans — without the invite flow.
// All operations route through the `admin-api` edge function, which gates
// on `platform_admins` membership server-side. This section is additionally
// hidden from non-platform-admins in the settings nav.
//
// Uses the three manual-provisioning actions: `create_org`, `create_user`,
// and `delete_org` (type-to-confirm in the UI).
// Existing actions reused: get_orgs, get_org_members, update_org_plan,
// update_member_role, remove_member.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building,
  Plus,
  Search,
  UserPlus,
  Users,
  Trash2,
  X,
  ChevronRight,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { adminApi, adminCreateOrg, adminCreateUser, adminDeleteOrg } from "@/api/admin";
import { SBadge, StatusMsg } from "./SettingsPrimitives";

type OrgRow = {
  id: string;
  name: string;
  createdAt?: string;
  memberCount?: number;
  plan?: string;
  subscriptionStatus?: string;
};

type MemberRow = {
  id: string;
  userId: string;
  email?: string | null;
  fullName?: string | null;
  role: string;
  status?: string;
  joinedAt?: string;
};

const PLAN_OPTIONS = ["free_trial", "starter", "growth", "scale", "enterprise"];
const ROLE_OPTIONS = ["owner", "admin", "member"];

function planLabel(code?: string): string {
  const map: Record<string, string> = {
    free_trial: "Free Trial",
    starter: "Starter",
    growth: "Growth",
    scale: "Scale",
    enterprise: "Enterprise",
  };
  return map[String(code || "")] || String(code || "—");
}

function initialsOf(name?: string | null, email?: string | null): string {
  const src = (name || email || "U").trim();
  return (
    src
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U"
  );
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function CompaniesSection() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgPlan, setNewOrgPlan] = useState("free_trial");
  const [creating, setCreating] = useState(false);

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("member");
  const [addingUser, setAddingUser] = useState(false);

  const [busyMember, setBusyMember] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi<{ orgs: OrgRow[] }>({ action: "get_orgs" });
      if (!res.ok) throw new Error(res.error || "Failed loading companies");
      setOrgs(res.data?.orgs || []);
    } catch (e: any) {
      setError(e?.message || "Failed loading companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  const loadMembers = useCallback(async (orgId: string) => {
    setMembersLoading(true);
    setError(null);
    try {
      const res = await adminApi<{ members: MemberRow[] }>({
        action: "get_org_members",
        params: { orgId },
      });
      if (!res.ok) throw new Error(res.error || "Failed loading members");
      setMembers(res.data?.members || []);
    } catch (e: any) {
      setError(e?.message || "Failed loading members");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const selectOrg = useCallback(
    (orgId: string) => {
      setSelectedOrgId((prev) => {
        const next = prev === orgId ? null : orgId;
        if (next) void loadMembers(next);
        else setMembers([]);
        return next;
      });
      setSuccess(null);
    },
    [loadMembers]
  );

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => (o.name || "").toLowerCase().includes(q));
  }, [orgs, search]);

  const selectedOrg = useMemo(
    () => orgs.find((o) => o.id === selectedOrgId) || null,
    [orgs, selectedOrgId]
  );

  async function handleCreateOrg() {
    const name = newOrgName.trim();
    if (!name) {
      setError("Company name is required");
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await adminCreateOrg({ name, plan: newOrgPlan });
      if (!res.ok) throw new Error(res.error || "Failed creating company");
      setSuccess(`Company "${name}" created`);
      setNewOrgName("");
      setNewOrgPlan("free_trial");
      setShowCreateOrg(false);
      await loadOrgs();
    } catch (e: any) {
      setError(e?.message || "Failed creating company");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddUser() {
    const email = newUserEmail.trim().toLowerCase();
    const fullName = newUserName.trim();
    if (!selectedOrgId) return;
    if (!email || !email.includes("@")) {
      setError("A valid email address is required");
      return;
    }
    if (!fullName) {
      setError("Full name is required");
      return;
    }
    if (!newUserPassword || newUserPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setAddingUser(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await adminCreateUser({
        email,
        full_name: fullName,
        password: newUserPassword,
        org_id: selectedOrgId,
        role: newUserRole,
      });
      if (!res.ok) throw new Error(res.error || "Failed creating user");
      setSuccess(`User ${email} added to ${selectedOrg?.name || "company"}`);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      setNewUserRole("member");
      setShowAddUser(false);
      await loadMembers(selectedOrgId);
      await loadOrgs();
    } catch (e: any) {
      setError(e?.message || "Failed creating user");
    } finally {
      setAddingUser(false);
    }
  }

  async function handleRoleChange(memberId: string, role: string) {
    setBusyMember(memberId);
    setError(null);
    try {
      const res = await adminApi({
        action: "update_member_role",
        params: { memberId, role },
      });
      if (!res.ok) throw new Error(res.error || "Failed updating role");
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    } catch (e: any) {
      setError(e?.message || "Failed updating role");
    } finally {
      setBusyMember(null);
    }
  }

  async function handleRemoveMember(memberId: string, email?: string | null) {
    if (!window.confirm(`Remove ${email || "this user"} from ${selectedOrg?.name || "the company"}?`)) return;
    setBusyMember(memberId);
    setError(null);
    try {
      const res = await adminApi({ action: "remove_member", params: { memberId } });
      if (!res.ok) throw new Error(res.error || "Failed removing member");
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setSuccess("Member removed");
      await loadOrgs();
    } catch (e: any) {
      setError(e?.message || "Failed removing member");
    } finally {
      setBusyMember(null);
    }
  }

  async function handlePlanChange(orgId: string, plan: string) {
    setError(null);
    try {
      const res = await adminApi({ action: "update_org_plan", params: { orgId, plan } });
      if (!res.ok) throw new Error(res.error || "Failed updating plan");
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, plan } : o)));
      setSuccess("Plan updated");
    } catch (e: any) {
      setError(e?.message || "Failed updating plan");
    }
  }

  function openDeleteOrg(org: OrgRow) {
    setDeleteTarget(org);
    setDeleteConfirmText("");
    setError(null);
    setSuccess(null);
  }

  async function handleDeleteOrg() {
    if (!deleteTarget) return;
    if (deleteConfirmText.trim() !== deleteTarget.name) {
      setError("Type the exact company name to confirm deletion");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await adminDeleteOrg({ org_id: deleteTarget.id });
      if (!res.ok) throw new Error(res.error || "Failed deleting company");
      setSuccess(`Company "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      setDeleteConfirmText("");
      if (selectedOrgId === deleteTarget.id) {
        setSelectedOrgId(null);
        setMembers([]);
      }
      await loadOrgs();
    } catch (e: any) {
      setError(e?.message || "Failed deleting company");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div
          style={{
            fontFamily: "var(--lit-font-sans, -apple-system,'Segoe UI',Inter,Roboto,sans-serif)",
            fontSize: 21,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          Companies
        </div>
        <div
          style={{
            fontFamily: "var(--lit-font-sans, -apple-system,'Segoe UI',Inter,Roboto,sans-serif)",
            fontSize: 13,
            color: "#64748b",
            marginTop: 4,
          }}
        >
          Manually create company accounts and manage their users — for demo
          accounts, no invitation required. Platform admins only.
        </div>
      </div>

      <StatusMsg error={error} success={success} />

      <div className="lit-companies-toolbar">
        <div className="lit-companies-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            aria-label="Search companies"
          />
        </div>
        <SBadge tone="slate">
          <Users size={11} /> {orgs.length} {orgs.length === 1 ? "company" : "companies"}
        </SBadge>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="lit-btn-primary"
          onClick={() => setShowCreateOrg(true)}
        >
          <Plus size={15} /> New company
        </button>
      </div>

      {loading ? (
        <div
          className="lit-profile-card"
          style={{ padding: 40, textAlign: "center", color: "#64748b" }}
        >
          <Loader2 size={22} className="lit-spin" style={{ animation: "lit-spin 1s linear infinite" }} />
          <div style={{ marginTop: 10, fontSize: 13 }}>Loading companies…</div>
        </div>
      ) : filteredOrgs.length === 0 ? (
        <div
          className="lit-profile-card"
          style={{ padding: 40, textAlign: "center", color: "#64748b" }}
        >
          <Building size={28} style={{ opacity: 0.4 }} />
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            No companies found
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {search ? "Try a different search." : "Create your first company to get started."}
          </div>
        </div>
      ) : (
        <div className="lit-org-grid">
          {filteredOrgs.map((org) => {
            const isSelected = org.id === selectedOrgId;
            return (
              <div key={org.id} className={`lit-org-card${isSelected ? " is-selected" : ""}`}>
                <div className="lit-org-card-top">
                  <div className="lit-org-avatar">{initialsOf(org.name)}</div>
                  <div className="lit-org-meta">
                    <div className="lit-org-name" title={org.name}>{org.name}</div>
                    <div className="lit-org-sub">
                      {org.memberCount ?? 0} members · Created {fmtDate(org.createdAt)}
                    </div>
                  </div>
                  <SBadge tone={org.subscriptionStatus === "active" ? "green" : "slate"}>
                    {planLabel(org.plan)}
                  </SBadge>
                </div>
                <div className="lit-org-card-actions">
                  <button
                    type="button"
                    className="lit-btn-ghost"
                    style={{ minHeight: 38, padding: "8px 14px", fontSize: 12.5 }}
                    onClick={() => selectOrg(org.id)}
                  >
                    {isSelected ? "Hide members" : "Manage members"}
                    <ChevronRight size={14} style={{ transform: isSelected ? "rotate(90deg)" : undefined }} />
                  </button>
                  <select
                    className="lit-select"
                    value={org.plan || "free_trial"}
                    onChange={(e) => handlePlanChange(org.id, (e.target as HTMLSelectElement).value)}
                    style={{ width: "auto", minHeight: 38, padding: "8px 12px", fontSize: 12.5 }}
                    aria-label={`Plan for ${org.name}`}
                    title="Change plan"
                  >
                    {PLAN_OPTIONS.map((p) => (
                      <option key={p} value={p}>{planLabel(p)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="lit-btn-danger-ghost"
                    style={{ minHeight: 38, padding: "8px 12px" }}
                    onClick={() => openDeleteOrg(org)}
                    aria-label={`Delete ${org.name}`}
                    title="Delete company"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {isSelected && (
                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#94a3b8",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        Members
                      </div>
                      <button
                        type="button"
                        className="lit-btn-ghost"
                        style={{ minHeight: 34, padding: "6px 12px", fontSize: 12 }}
                        onClick={() => setShowAddUser(true)}
                      >
                        <UserPlus size={13} /> Add user
                      </button>
                    </div>
                    {membersLoading ? (
                      <div style={{ padding: 16, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                        Loading members…
                      </div>
                    ) : members.length === 0 ? (
                      <div style={{ padding: 12, color: "#94a3b8", fontSize: 13 }}>
                        No members yet. Add the first user manually.
                      </div>
                    ) : (
                      <div>
                        {members.map((m) => (
                          <div key={m.id} className="lit-member-row">
                            <div className="lit-member-avatar">
                              {initialsOf(m.fullName, m.email)}
                            </div>
                            <div className="lit-member-meta">
                              <div className="lit-member-name">{m.fullName || m.email || "—"}</div>
                              <div className="lit-member-email">{m.email || "—"}</div>
                            </div>
                            <div className="lit-member-actions">
                              <select
                                className="lit-select"
                                value={m.role}
                                disabled={busyMember === m.id}
                                onChange={(e) => handleRoleChange(m.id, (e.target as HTMLSelectElement).value)}
                                style={{ width: "auto", minHeight: 36, padding: "6px 10px", fontSize: 12 }}
                                aria-label={`Role for ${m.email}`}
                              >
                                {ROLE_OPTIONS.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="lit-btn-danger-ghost"
                                style={{ minHeight: 36, padding: "6px 10px" }}
                                disabled={busyMember === m.id}
                                onClick={() => handleRemoveMember(m.id, m.email)}
                                aria-label={`Remove ${m.email}`}
                                title="Remove member"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create company modal */}
      {showCreateOrg && (
        <div className="lit-modal-backdrop" onClick={() => !creating && setShowCreateOrg(false)}>
          <div className="lit-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create company">
            <div className="lit-modal-head">
              <h3 className="lit-modal-title">Create company</h3>
              <button
                type="button"
                className="lit-settings-iconbtn"
                onClick={() => setShowCreateOrg(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="lit-modal-body">
              <div>
                <label className="lit-field-label" htmlFor="new-org-name">
                  Company name <span className="req">*</span>
                </label>
                <input
                  id="new-org-name"
                  className="lit-input"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Freight Demo"
                  autoFocus
                />
              </div>
              <div>
                <label className="lit-field-label" htmlFor="new-org-plan">Plan</label>
                <select
                  id="new-org-plan"
                  className="lit-select"
                  value={newOrgPlan}
                  onChange={(e) => setNewOrgPlan((e.target as HTMLSelectElement).value)}
                >
                  {PLAN_OPTIONS.map((p) => (
                    <option key={p} value={p}>{planLabel(p)}</option>
                  ))}
                </select>
                <div className="lit-field-hint">
                  The company starts with an empty workspace — add users below.
                </div>
              </div>
            </div>
            <div className="lit-modal-foot">
              <button
                type="button"
                className="lit-btn-ghost"
                onClick={() => setShowCreateOrg(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="lit-btn-primary"
                onClick={handleCreateOrg}
                disabled={creating || !newOrgName.trim()}
              >
                {creating ? "Creating…" : "Create company"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add user modal */}
      {showAddUser && selectedOrg && (
        <div className="lit-modal-backdrop" onClick={() => !addingUser && setShowAddUser(false)}>
          <div className="lit-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add user">
            <div className="lit-modal-head">
              <h3 className="lit-modal-title">Add user to {selectedOrg.name}</h3>
              <button
                type="button"
                className="lit-settings-iconbtn"
                onClick={() => setShowAddUser(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="lit-modal-body">
              <div className="lit-alert lit-alert-amber" style={{ marginBottom: 0 }}>
                <ShieldCheck size={15} className="lit-alert-icon" />
                <div className="lit-alert-body">
                  Manual provisioning — no invitation email is sent. Share the
                  credentials you set here with the demo user directly.
                </div>
              </div>
              <div className="lit-form-inline">
                <div className="span-2">
                  <label className="lit-field-label" htmlFor="new-user-email">
                    Email <span className="req">*</span>
                  </label>
                  <input
                    id="new-user-email"
                    className="lit-input"
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="demo@example.com"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="lit-field-label" htmlFor="new-user-name">
                    Full name <span className="req">*</span>
                  </label>
                  <input
                    id="new-user-name"
                    className="lit-input"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Jordan Smith"
                  />
                </div>
                <div>
                  <label className="lit-field-label" htmlFor="new-user-role">Role</label>
                  <select
                    id="new-user-role"
                    className="lit-select"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole((e.target as HTMLSelectElement).value)}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="span-2">
                  <label className="lit-field-label" htmlFor="new-user-password">
                    Temporary password <span className="req">*</span>
                  </label>
                  <input
                    id="new-user-password"
                    className="lit-input"
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                  />
                  <div className="lit-field-hint">
                    The user signs in immediately with this email and password.
                  </div>
                </div>
              </div>
            </div>
            <div className="lit-modal-foot">
              <button
                type="button"
                className="lit-btn-ghost"
                onClick={() => setShowAddUser(false)}
                disabled={addingUser}
              >
                Cancel
              </button>
              <button
                type="button"
                className="lit-btn-primary"
                onClick={handleAddUser}
                disabled={addingUser}
              >
                {addingUser ? "Adding…" : "Add user"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete company modal — type-to-confirm */}
      {deleteTarget && (
        <div className="lit-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="lit-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delete company">
            <div className="lit-modal-head">
              <h3 className="lit-modal-title">Delete company</h3>
              <button
                type="button"
                className="lit-settings-iconbtn"
                onClick={() => setDeleteTarget(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="lit-modal-body">
              <div className="lit-alert lit-alert-red" style={{ marginBottom: 0 }}>
                <Trash2 size={15} className="lit-alert-icon" />
                <div className="lit-alert-body">
                  This permanently deletes <strong>{deleteTarget.name}</strong> and
                  its members, invites, and subscription. Business data
                  (campaigns, leads, etc.) is never wiped silently — deletion
                  is refused while associated data exists. This cannot be undone.
                </div>
              </div>
              <div>
                <label className="lit-field-label" htmlFor="delete-org-confirm">
                  Type <strong>{deleteTarget.name}</strong> to confirm <span className="req">*</span>
                </label>
                <input
                  id="delete-org-confirm"
                  className="lit-input"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText((e.target as HTMLInputElement).value)}
                  placeholder={deleteTarget.name}
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="lit-modal-foot">
              <button
                type="button"
                className="lit-btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="lit-btn-danger"
                onClick={handleDeleteOrg}
                disabled={deleting || deleteConfirmText.trim() !== deleteTarget.name}
              >
                {deleting ? "Deleting…" : "Delete company"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes lit-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
