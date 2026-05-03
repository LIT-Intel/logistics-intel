// SettingsSections.tsx — Design-faithful port of SettingsSections.jsx +
// SettingsIntegrations.jsx. Inline style={{ }} with exact hex tokens.
// All export signatures preserved byte-identical so SettingsPage.tsx doesn't break.
import React, { useEffect, useState, useRef } from "react";
import {
  User,
  Building2,
  Mail,
  ShieldCheck,
  Bell,
  KeyRound,
  Plug,
  Upload,
  Trash2,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  AlertTriangle,
  Monitor,
  Smartphone,
  Lock,
  Coins,
  ExternalLink,
  Gift,
  FileText,
  Linkedin,
  Users,
  WifiOff,
} from "lucide-react";
import { PLAN_LIMITS, normalizePlan as normalizePlanCode } from "@/lib/planLimits";
import { listEmailAccounts, startGmailOAuth, startOutlookOAuth, sendTestEmail } from "@/lib/api";
import { useInboxStatus } from "@/features/outbound/hooks/useInboxStatus";
import type { LitEmailAccountRow } from "@/types/lit-outbound";
import { useAuth } from "@/auth/AuthProvider";
import {
  SCard,
  SectionHeader,
  SField,
  SInput,
  STextarea,
  SSelect,
  SToggle,
  RawToggle,
  SBadge,
  SLockOverlay,
  BtnPrimary,
  BtnGhost,
  BtnDanger,
  BtnDark,
  StatusMsg,
  sBtnPrimary,
  sBtnGhost,
  sBtnDanger,
  sBtnDark,
  sInputStyle,
} from "./SettingsPrimitives";

// ─── Section ID type + constant ──────────────────────────────────────────────
export type SettingsSectionId =
  | "Profile"
  | "Workspace"
  | "Security"
  | "Notifications"
  | "Integrations"
  | "Preferences";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  title: string;
  icon: React.ComponentType<any>;
}> = [
  { id: "Profile",       title: "Profile",       icon: User },
  { id: "Workspace",     title: "Workspace",     icon: Building2 },
  { id: "Security",      title: "Security",      icon: ShieldCheck },
  { id: "Notifications", title: "Notifications", icon: Bell },
  { id: "Integrations",  title: "Integrations",  icon: Plug },
  { id: "Preferences",   title: "Preferences",   icon: KeyRound },
];

// ─── Timezone options ────────────────────────────────────────────────────────
const TIMEZONE_OPTIONS = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

// ─── Messaging prefs ─────────────────────────────────────────────────────────
type MessagingKey = "mentions" | "weekly_digest" | "direct_messages" | "assignments";

const MESSAGING_ROWS: Array<{ key: MessagingKey; label: string; sub: string }> = [
  { key: "mentions",        label: "@mentions in comments", sub: "Email me when teammates tag me." },
  { key: "weekly_digest",   label: "Weekly digest",         sub: "Monday morning summary of pipeline." },
  { key: "direct_messages", label: "Direct messages",       sub: "In-app DMs from workspace members." },
  { key: "assignments",     label: "Assignments",           sub: "Notify when a deal is routed to me." },
];

function defaultMessagingPrefs(): Record<MessagingKey, boolean> {
  return { mentions: true, weekly_digest: true, direct_messages: true, assignments: true };
}

function normalizeMessagingPrefs(input?: Partial<Record<MessagingKey, boolean>>): Record<MessagingKey, boolean> {
  const base = defaultMessagingPrefs();
  if (!input) return base;
  for (const row of MESSAGING_ROWS) {
    if (typeof input[row.key] === "boolean") base[row.key] = input[row.key] as boolean;
  }
  return base;
}

// ─── ProfileSection ──────────────────────────────────────────────────────────
type ProfileSectionProps = {
  initialData?: {
    name?: string;
    email?: string;
    title?: string;
    phone?: string;
    location?: string;
    bio?: string;
    timezone?: string;
    avatar_url?: string;
    plan?: string;
    planStatus?: string;
    isAdmin?: boolean;
  };
  messagingPrefs?: Partial<Record<MessagingKey, boolean>>;
  onSave?: (data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onUploadAvatar?: (file: File) => Promise<{ error?: string } | void>;
  onSaveMessagingPreferences?: (data: Record<MessagingKey, boolean>) => Promise<{ error?: string } | void>;
  isAdmin?: boolean;
};

const BIO_MAX = 160;

export function ProfileSection({
  initialData,
  messagingPrefs,
  onSave,
  onUploadAvatar,
  onSaveMessagingPreferences,
}: ProfileSectionProps) {
  const [form, setForm] = useState({
    name: initialData?.name || "",
    title: initialData?.title || "",
    phone: initialData?.phone || "",
    location: initialData?.location || "",
    timezone: initialData?.timezone || "",
    bio: initialData?.bio || "",
  });
  const [initial, setInitial] = useState(form);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [msg, setMsg] = useState<Record<MessagingKey, boolean>>(() =>
    normalizeMessagingPrefs(messagingPrefs),
  );
  const [msgSaving, setMsgSaving] = useState<MessagingKey | null>(null);

  useEffect(() => {
    const next = {
      name: initialData?.name || "",
      title: initialData?.title || "",
      phone: initialData?.phone || "",
      location: initialData?.location || "",
      timezone: initialData?.timezone || "",
      bio: initialData?.bio || "",
    };
    setForm(next);
    setInitial(next);
  }, [
    initialData?.name, initialData?.title, initialData?.phone,
    initialData?.location, initialData?.timezone, initialData?.bio,
  ]);

  useEffect(() => {
    setMsg(normalizeMessagingPrefs(messagingPrefs));
  }, [messagingPrefs]);

  const dirty =
    form.name !== initial.name || form.title !== initial.title ||
    form.phone !== initial.phone || form.location !== initial.location ||
    form.timezone !== initial.timezone || form.bio !== initial.bio;

  async function handleSave() {
    if (!dirty) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const result = await onSave?.(form);
      if ((result as any)?.error) setError((result as any).error);
      else { setSuccess("Profile saved"); setInitial(form); }
    } catch (e: any) { setError(e?.message || "Failed saving profile"); }
    finally { setSaving(false); }
  }

  async function toggleMessaging(key: MessagingKey) {
    if (!onSaveMessagingPreferences) return;
    const optimistic = { ...msg, [key]: !msg[key] };
    setMsg(optimistic);
    setMsgSaving(key);
    try {
      const result = await onSaveMessagingPreferences(optimistic);
      if ((result as any)?.error) setMsg(msg);
    } catch { setMsg(msg); }
    finally { setMsgSaving(null); }
  }

  const initials = (initialData?.name || initialData?.email || "U")
    .split(/\s+|@/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]).join("").toUpperCase().slice(0, 2) || "U";

  const avatarUrl = initialData?.avatar_url || "";
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onUploadAvatar) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, GIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }
    setUploadingAvatar(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await onUploadAvatar(file);
      if ((result as any)?.error) setError((result as any).error);
      else setSuccess("Photo updated");
    } catch (err: any) {
      setError(err?.message || "Failed to upload photo");
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader
        title="Profile"
        subtitle="Your personal identity across Logistic Intel. Displayed on your outbound sends, comments, and teammate mentions."
      />
      <StatusMsg error={error} success={success} />

      {/* Identity card */}
      <SCard title="Identity" subtitle="Public profile details visible to your workspace and in outbound signatures.">
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          {/* Avatar */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{
              width: 104, height: 104, borderRadius: "50%",
              background: avatarUrl
                ? `url(${avatarUrl}) center/cover`
                : "linear-gradient(135deg,#1d4ed8,#3b82f6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Space Grotesk,sans-serif", fontSize: 36, fontWeight: 700,
              color: "#fff", letterSpacing: "-0.02em",
              boxShadow: "0 4px 14px rgba(59,130,246,0.25)",
              overflow: "hidden",
            }}>
              {!avatarUrl && initials}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleAvatarChange}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar || !onUploadAvatar}
              style={{
                ...sBtnGhost,
                fontSize: 12,
                padding: "6px 11px",
                opacity: uploadingAvatar || !onUploadAvatar ? 0.6 : 1,
                cursor: uploadingAvatar || !onUploadAvatar ? "not-allowed" : "pointer",
              }}
            >
              <Upload size={12} /> {uploadingAvatar ? "Uploading…" : "Change photo"}
            </button>
          </div>
          {/* Fields */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <SField label="Full name" required>
              <SInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </SField>
            <SField label="Job title">
              <SInput value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. VP of Sales" />
            </SField>
            <SField label="Email" hint="Primary login email — verified">
              <SInput value={initialData?.email || ""} readOnly style={{ opacity: 0.6, cursor: "not-allowed" }} />
            </SField>
            <SField label="Phone">
              <SInput value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
            </SField>
            <SField label="Location">
              <SInput value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="City, Country" />
            </SField>
            <SField label="Timezone">
              <SSelect
                value={form.timezone}
                onChange={(e) => setForm((p) => ({ ...p, timezone: (e.target as HTMLSelectElement).value }))}
                options={TIMEZONE_OPTIONS}
              />
            </SField>
            <SField label="Short bio" hint="160 chars max. Shown on your outbound signature and teammate cards." span={2}>
              <STextarea
                rows={2}
                value={form.bio}
                maxLength={BIO_MAX}
                onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                placeholder="VP Sales @ Logistic Intel. 12 years closing ocean freight RFPs."
              />
            </SField>
          </div>
        </div>
        {/* Save row */}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid #F1F5F9", paddingTop: 14 }}>
          <button onClick={() => setForm(initial)} disabled={!dirty || saving} style={{ ...sBtnGhost, opacity: !dirty ? 0.5 : 1 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!dirty || saving} style={{ ...sBtnDark, opacity: !dirty ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </SCard>

      {/* Messaging preferences */}
      <SCard title="Messaging preferences" subtitle="How teammates and automated systems contact you inside the app.">
        <div className="lit-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {MESSAGING_ROWS.map((row) => (
            <SToggle
              key={row.key}
              checked={msg[row.key]}
              onChange={() => toggleMessaging(row.key)}
              label={row.label}
              sub={row.sub}
              disabled={msgSaving !== null && msgSaving !== row.key}
            />
          ))}
        </div>
      </SCard>

      {/* Account handoff */}
      <SCard title="Account" subtitle="Session, password, and two-factor security live under Security." />
    </div>
  );
}

// ─── WorkspaceSection ────────────────────────────────────────────────────────
function isInviteAllowedPlan(plan?: string | null): boolean {
  return PLAN_LIMITS[normalizePlanCode(plan)].features.seat_management === true;
}

function planDisplayLabel(plan?: string | null): string {
  return PLAN_LIMITS[normalizePlanCode(plan)].label;
}

/**
 * Premium gating card. Replaces the previous amber lock-style card so
 * upgrade nudges share the same Pulse-Coach visual language as the
 * Profile-page quota cards: slate gradient, cyan accent, white/10
 * gloss border. Plan-aware copy + CTA.
 */
function TeamUpgradeCard({ plan, onUpgrade }: { plan?: string | null; onUpgrade?: () => void }) {
  const planLabel = planDisplayLabel(plan);
  const recommended = (plan ?? "").toLowerCase().includes("starter") ? "Growth" : "Growth";
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        padding: 18,
        boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18), 0 4px 14px rgba(15,23,42,0.18)",
      }}
    >
      <span
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "absolute",
          top: -48,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          opacity: 0.5,
          background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)",
        }}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "rgba(0,240,255,0.10)",
            border: "1px solid rgba(255,255,255,0.10)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Lock size={14} color="#00F0FF" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "Space Grotesk,sans-serif",
              fontSize: 12.5, fontWeight: 700, color: "#fff",
              letterSpacing: "0.01em",
            }}
          >
            Pulse Coach
            <span
              style={{
                fontFamily: "ui-monospace,monospace",
                fontSize: 9, fontWeight: 700,
                color: "#00F0FF",
                border: "1px solid rgba(0,240,255,0.35)",
                background: "rgba(0,240,255,0.08)",
                padding: "1px 6px",
                borderRadius: 4,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {planLabel}
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: "DM Sans,sans-serif",
              fontSize: 12.5, lineHeight: 1.55, color: "#cbd5e1",
            }}
          >
            Team invites unlock on <strong style={{ color: "#fff" }}>{recommended}</strong> and above. Bring your colleagues into one shared workspace, share saved companies and Pulse briefs, and route deals by role.
          </div>
          <button
            onClick={onUpgrade}
            style={{
              marginTop: 12,
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "linear-gradient(180deg,#0F172A 0%,#0B1220 100%)",
              color: "#fff",
              fontFamily: "Space Grotesk,sans-serif",
              fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(15,23,42,0.35)",
            }}
          >
            Compare plans
            <span style={{ color: "#00F0FF", fontSize: 13, lineHeight: 1 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceSection(props: {
  workspaceName?: string;
  workspaceRole?: string;
  joinedLabel?: string;
  plan?: string | null;
  members?: any[];
  invites?: any[];
  seatLimit?: number;
  onInvite?: (email: string, role: string) => Promise<{ error?: string } | void>;
  onRevoke?: (memberId: string) => Promise<{ error?: string } | void>;
  onUpdateRole?: (memberId: string, role: string) => Promise<{ error?: string } | void>;
  onRevokeInvite?: (inviteId: string) => Promise<{ error?: string } | void>;
  isAdmin?: boolean;
  onUpgrade?: () => void;
}) {
  const [tab, setTab] = useState<"members" | "invites" | "roles">("members");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const members = props.members || [];
  const invites = props.invites || [];
  const allowed = isInviteAllowedPlan(props.plan);
  const seatLine = props.seatLimit
    ? `${members.length} of ${props.seatLimit} seats used`
    : `${members.length} active members`;

  const ROLES_ROWS = [
    ["Discover companies",               true, true, true, true],
    ["Add to Command Center",            true, true, true, false],
    ["Launch Outbound campaigns",        true, true, true, false],
    ["Connect inbox / sending accounts", true, true, true, false],
    ["Build and send RFPs",              true, true, true, false],
    ["Invite teammates",                 true, true, false, false],
    ["Manage billing",                   true, false, false, false],
    ["Manage integrations",              true, true, false, false],
    ["Delete workspace",                 true, false, false, false],
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader
        title="Workspace"
        subtitle="Your shared organization, role, and team membership."
        right={props.isAdmin ? <SBadge tone="blue" icon={<ShieldCheck size={11} />}>Admin</SBadge> : undefined}
      />

      {/* Workspace identity card */}
      <SCard>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg,#1d4ed8,#3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Space Grotesk,sans-serif", fontSize: 18, fontWeight: 700, color: "#fff",
            boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
          }}>
            {(props.workspaceName?.[0] || "L").toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
              {props.workspaceName || "Logistic Intel workspace"}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {props.workspaceRole && <SBadge tone="blue">{props.workspaceRole}</SBadge>}
              {props.joinedLabel && <SBadge tone="slate">Joined {props.joinedLabel}</SBadge>}
              <SBadge tone="slate">{seatLine}</SBadge>
            </div>
          </div>
        </div>
      </SCard>

      {!allowed ? (
        <TeamUpgradeCard plan={props.plan} onUpgrade={props.onUpgrade} />
      ) : (
        <>
          <StatusMsg error={err} success={msg} />

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, padding: 4, background: "#F1F5F9", borderRadius: 10, width: "fit-content" }}>
            {([["members", `Members · ${members.length}`], ["invites", `Pending · ${invites.length}`], ["roles", "Role permissions"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: "7px 14px", borderRadius: 7, border: "none",
                fontFamily: "Space Grotesk,sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                background: tab === k ? "#fff" : "transparent",
                color: tab === k ? "#0F172A" : "#64748b",
                boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}>{l}</button>
            ))}
          </div>

          {/* Members tab */}
          {tab === "members" && (
            <SCard>
              {props.isAdmin && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <SInput
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    style={{ flex: 1 }}
                  />
                  <SSelect
                    value={inviteRole}
                    onChange={(e) => setInviteRole((e.target as HTMLSelectElement).value)}
                    options={[{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }]}
                    style={{ width: 140 }}
                  />
                  <button
                    style={sBtnPrimary}
                    onClick={async () => {
                      setErr(null); setMsg(null);
                      const result = await props.onInvite?.(inviteEmail, inviteRole);
                      if ((result as any)?.error) setErr((result as any).error);
                      else { setMsg("Invite sent"); setInviteEmail(""); setInviteRole("member"); }
                    }}
                  >
                    <Plus size={13} /> Invite
                  </button>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {members.length === 0 ? (
                  <div style={{ padding: "20px 4px", fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#94a3b8" }}>No members found.</div>
                ) : members.map((m: any, i: number) => (
                  <div key={m.id || m.user_id} style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "12px 4px",
                    borderBottom: i < members.length - 1 ? "1px solid #F1F5F9" : "none",
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontFamily: "Space Grotesk,sans-serif", fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(m.full_name || m.email || "U").split(/\s+/).slice(0, 2).map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13.5, fontWeight: 600, color: "#0F172A" }}>
                        {m.full_name || m.email || "User"}
                      </div>
                      <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#64748b", marginTop: 1 }}>
                        {m.email || m.user_id}
                      </div>
                    </div>
                    <SBadge tone={m.status === "active" || !m.status ? "green" : "slate"} dot>
                      {m.status || "Active"}
                    </SBadge>
                    {props.isAdmin && (
                      <select
                        value={m.role}
                        onChange={async (e) => {
                          setErr(null); setMsg(null);
                          const result = await props.onUpdateRole?.(m.id || m.user_id, e.target.value);
                          if ((result as any)?.error) setErr((result as any).error);
                          else setMsg("Role updated");
                        }}
                        disabled={m.role === "owner"}
                        style={{ ...sInputStyle, width: 130, padding: "6px 10px", fontSize: 12.5, cursor: m.role === "owner" ? "not-allowed" : "pointer" }}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        {m.role === "owner" && <option value="owner">Owner</option>}
                      </select>
                    )}
                    {props.isAdmin && m.role !== "owner" && (
                      <button
                        onClick={async () => {
                          setErr(null); setMsg(null);
                          const result = await props.onRevoke?.(m.id || m.user_id);
                          if ((result as any)?.error) setErr((result as any).error);
                          else setMsg("Member removed");
                        }}
                        style={{ background: "none", border: "none", padding: 6, borderRadius: 6, cursor: "pointer", color: "#94a3b8" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </SCard>
          )}

          {/* Invites tab */}
          {tab === "invites" && (
            <SCard>
              {invites.length === 0 ? (
                <div style={{ padding: "20px 4px", textAlign: "center", fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#94a3b8" }}>
                  No pending invites.
                </div>
              ) : invites.map((inv: any, i: number) => (
                <div key={inv.id} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 4px",
                  borderBottom: i < invites.length - 1 ? "1px solid #F1F5F9" : "none",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", background: "#F1F5F9",
                    border: "1px dashed #CBD5E1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Mail size={15} color="#94a3b8" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13.5, fontWeight: 600, color: "#0F172A" }}>{inv.email}</div>
                    <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#64748b", marginTop: 1 }}>
                      {inv.role} · pending
                    </div>
                  </div>
                  <SBadge tone="amber" dot>Pending</SBadge>
                  <SBadge tone="blue">{inv.role}</SBadge>
                  {props.isAdmin && (
                    <button
                      onClick={async () => {
                        setErr(null); setMsg(null);
                        const result = await props.onRevokeInvite?.(inv.id);
                        if ((result as any)?.error) setErr((result as any).error);
                        else setMsg("Invite revoked");
                      }}
                      style={{ ...sBtnDanger, padding: "6px 11px", fontSize: 12 }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </SCard>
          )}

          {/* Roles tab */}
          {tab === "roles" && (
            <SCard>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans,sans-serif" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "Space Grotesk,sans-serif", fontWeight: 600, borderBottom: "1px solid #E5E7EB" }}>Permission</th>
                      {["Admin", "Manager", "Member", "Viewer"].map((r) => (
                        <th key={r} style={{ textAlign: "center", padding: "8px 12px", fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "Space Grotesk,sans-serif", fontWeight: 600, borderBottom: "1px solid #E5E7EB" }}>{r}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROLES_ROWS.map(([perm, ...flags], i) => (
                      <tr key={perm} style={{ borderBottom: i < ROLES_ROWS.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                        <td style={{ padding: "11px 12px", fontSize: 13, color: "#0F172A", fontFamily: "Space Grotesk,sans-serif", fontWeight: 500 }}>{perm}</td>
                        {(flags as boolean[]).map((f, j) => (
                          <td key={j} style={{ textAlign: "center", padding: "11px 12px" }}>
                            {f
                              ? <CheckCircle2 size={14} color="#22c55e" />
                              : <span style={{ display: "inline-block", width: 14, height: 2, background: "#CBD5E1", borderRadius: 1 }} />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SCard>
          )}
        </>
      )}
    </div>
  );
}

// ─── SecuritySection ─────────────────────────────────────────────────────────
export function SecuritySection(props: {
  email?: string | null;
  authProvider?: string | null;
  auditLog?: Array<{ id: string; action: string; ip_address?: string; created_at: string }>;
  plan?: string | null;
  apiKeys?: Array<{ id: string; key_name: string; key_prefix: string; last_used_at?: string; created_at: string; scope?: string }>;
  onGenerateKey?: (keyName: string) => Promise<string | null>;
  onRevokeKey?: (keyId: string) => Promise<void>;
}) {
  const provider = (props.authProvider || "email").toLowerCase();
  const providerLabel =
    provider === "google" ? "Google" :
    provider === "azure" || provider === "microsoft" ? "Microsoft" :
    "Email + password";
  const apiAllowed = props.plan === "scale" || props.plan === "enterprise";
  const [keyName, setKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader title="Security & API" subtitle="Password, two-factor, active sessions, and developer API keys." />

      {/* Password + 2FA two-up */}
      <div className="lit-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SCard title="Password" subtitle={`Sign-in via ${providerLabel}.`}>
          <a
            href="/reset-password"
            style={{ ...sBtnGhost, display: "inline-flex", textDecoration: "none" }}
          >
            <KeyRound size={13} /> Change password
          </a>
        </SCard>
        <SCard title="Two-factor authentication" subtitle="Add a second step at sign-in. Recommended.">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SBadge tone="slate" dot>Not configured</SBadge>
            <button style={{ ...sBtnGhost, fontSize: 12, padding: "6px 11px" }}>Set up 2FA</button>
          </div>
        </SCard>
      </div>

      {/* Recent activity / audit log */}
      <SCard
        title="Recent activity"
        right={
          <span style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
            Last {Math.min(20, props.auditLog?.length ?? 0)} events
          </span>
        }
      >
        {(!props.auditLog || props.auditLog.length === 0) ? (
          <div style={{
            borderRadius: 10, border: "1px dashed #E5E7EB", padding: "24px 16px",
            textAlign: "center", fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#94a3b8",
          }}>
            No recent activity yet. Sign-ins and security events will appear here.
          </div>
        ) : (
          <div>
            {props.auditLog.map((event, i) => (
              <div key={event.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "11px 0",
                borderBottom: i < (props.auditLog?.length ?? 0) - 1 ? "1px solid #F1F5F9" : "none",
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Monitor size={15} color="#64748b" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{event.action}</div>
                  <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {event.ip_address ? `${event.ip_address} · ` : ""}
                    {new Date(event.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SCard>

      {/* API keys — plan-gated */}
      <SCard
        title="API keys"
        subtitle="Programmatic access to company intelligence, pipeline, and outbound events."
        danger={!apiAllowed}
        right={apiAllowed && props.onGenerateKey ? (
          <button style={sBtnPrimary} onClick={async () => {
            const val = await props.onGenerateKey!(keyName || "New key");
            if (val) { setGeneratedKey(val); setKeyName(""); }
          }}>
            <Plus size={13} /> New key
          </button>
        ) : undefined}
      >
        {!apiAllowed ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Lock size={15} color="#2563EB" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>API access is on Scale + Enterprise</div>
              <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12.5, color: "#64748b", marginTop: 2 }}>Upgrade to programmatically access company intelligence, pipeline, and outbound events.</div>
            </div>
          </div>
        ) : (
          <div>
            {generatedKey && (
              <div style={{ marginBottom: 14, borderRadius: 10, border: "1px solid #BBF7D0", background: "#F0FDF4", padding: "12px 14px" }}>
                <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 12, fontWeight: 700, color: "#15803d", marginBottom: 6 }}>Copy this key now — shown once only:</div>
                <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: "#0F172A", wordBreak: "break-all" }}>{generatedKey}</div>
              </div>
            )}
            {(props.apiKeys || []).map((k, i) => (
              <div key={k.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "10px 0",
                borderBottom: i < (props.apiKeys?.length ?? 0) - 1 ? "1px solid #F1F5F9" : "none",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{k.key_name}</div>
                  <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                    {k.key_prefix}···  · created {new Date(k.created_at).toLocaleDateString()}
                  </div>
                </div>
                <SBadge tone={k.scope === "read" ? "blue" : "violet"}>{k.scope || "write"}</SBadge>
                <button onClick={() => props.onRevokeKey?.(k.id)} style={{ ...sBtnDanger, padding: "6px 11px", fontSize: 12 }}>Revoke</button>
              </div>
            ))}
            {(props.apiKeys || []).length === 0 && !generatedKey && (
              <div style={{ padding: "16px 0", fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#94a3b8" }}>
                No API keys yet. Generate one above.
              </div>
            )}
          </div>
        )}
      </SCard>
    </div>
  );
}

// ─── AlertsNotificationsSection ──────────────────────────────────────────────
const NOTIFICATION_EVENTS: Array<{ id: string; label: string; description: string }> = [
  { id: "reply_received",    label: "Reply received",         description: "A prospect replies to a campaign email." },
  { id: "meeting_booked",    label: "Meeting booked",         description: "A prospect books a slot on your calendar." },
  { id: "deal_stage_changed",label: "Deal stage changed",     description: "Someone moves a deal in Command Center." },
  { id: "campaign_finished", label: "Campaign finished",      description: "All prospects in a sequence have completed." },
  { id: "rfp_due_soon",      label: "RFP due within 48h",     description: "Deal Builder items approaching deadline." },
  { id: "weekly_digest",     label: "Weekly pipeline digest", description: "Monday morning summary." },
  { id: "billing_alerts",    label: "Billing alerts",         description: "Invoice failures, credit exhaustion." },
  { id: "security_events",   label: "Security events",        description: "New device login, password changes." },
];

type NotifChannel = "email" | "in_app" | "slack";
type NotifMatrix = Record<string, Record<NotifChannel, boolean>>;

function defaultMatrix(): NotifMatrix {
  const m: NotifMatrix = {};
  for (const ev of NOTIFICATION_EVENTS) {
    m[ev.id] = { email: true, in_app: true, slack: false };
  }
  return m;
}

function readMatrix(preferences: any): NotifMatrix {
  const from = preferences?.matrix;
  if (!from || typeof from !== "object") return defaultMatrix();
  const defaults = defaultMatrix();
  const merged: NotifMatrix = {};
  for (const ev of NOTIFICATION_EVENTS) {
    const stored = from[ev.id] || {};
    merged[ev.id] = {
      email: stored.email ?? defaults[ev.id].email,
      in_app: stored.in_app ?? defaults[ev.id].in_app,
      slack: stored.slack ?? defaults[ev.id].slack,
    };
  }
  return merged;
}

export function AlertsNotificationsSection({ preferences, onSavePreferences }: any) {
  const [matrix, setMatrix] = useState<NotifMatrix>(() => readMatrix(preferences));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  useEffect(() => { setMatrix(readMatrix(preferences)); }, [preferences]);

  function toggle(eventId: string, channel: NotifChannel) {
    setMatrix((prev) => ({ ...prev, [eventId]: { ...prev[eventId], [channel]: !prev[eventId][channel] } }));
    setStatus(null);
  }

  async function handleSave() {
    if (!onSavePreferences) return;
    setSaving(true); setStatus(null);
    try {
      await onSavePreferences({ matrix });
      setStatus({ kind: "ok", message: "Notification preferences saved" });
    } catch (err: any) {
      setStatus({ kind: "error", message: err?.message || "Could not save preferences. Please try again." });
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader title="Alerts & notifications" subtitle="Route the signals you care about to email, in-app, or Slack. Everything else stays quiet." />
      <SCard>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", gap: 8, padding: "0 0 10px 4px", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Event</div>
          {(["Email", "In-app", "Slack"] as const).map((h) => (
            <div key={h} style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center" }}>{h}</div>
          ))}
        </div>

        {NOTIFICATION_EVENTS.map((ev, i) => (
          <div key={ev.id} style={{
            display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", gap: 8,
            padding: "12px 4px", alignItems: "center",
            borderBottom: i < NOTIFICATION_EVENTS.length - 1 ? "1px solid #F1F5F9" : "none",
          }}>
            <div>
              <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{ev.label}</div>
              <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#64748b", marginTop: 2 }}>{ev.description}</div>
            </div>
            {(["email", "in_app", "slack"] as NotifChannel[]).map((ch) => {
              const on = matrix[ev.id]?.[ch] ?? false;
              return (
                <div key={ch} style={{ display: "flex", justifyContent: "center" }}>
                  <RawToggle on={on} onToggle={() => toggle(ev.id, ch)} label={`${ev.label} — ${ch}`} small />
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #F1F5F9", paddingTop: 14, marginTop: 4 }}>
          {status && (
            <SBadge tone={status.kind === "ok" ? "green" : "red"}>
              {status.kind === "ok" ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
              {status.message}
            </SBadge>
          )}
          <button onClick={handleSave} disabled={saving} style={sBtnPrimary}>
            {saving ? "Saving…" : "Save notification settings"}
          </button>
        </div>
      </SCard>
    </div>
  );
}

// ─── ReadinessDot ─────────────────────────────────────────────────────────────
function ReadinessDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: ok ? "#22c55e" : "#CBD5E1",
        boxShadow: ok ? "0 0 6px rgba(34,197,94,0.5)" : "none",
      }} />
      <span style={{
        fontFamily: "Space Grotesk,sans-serif", fontSize: 11.5, fontWeight: 600,
        color: ok ? "#15803d" : "#94a3b8",
      }}>{label}</span>
    </div>
  );
}

// ─── Gmail / Outlook cards (design IntegrationCard style) ─────────────────────
type ProviderCardState = "loading" | "connected" | "not_connected" | "setup_required" | "error";

function IntegrationCard({
  name,
  category,
  description,
  connected,
  account,
  cardState,
  onConnect,
  connecting,
  localSetupRequired,
  connectError,
  onRefresh,
}: {
  name: string;
  category: string;
  description: string;
  connected: boolean;
  account?: string | null;
  cardState: ProviderCardState;
  onConnect: () => void;
  connecting: boolean;
  localSetupRequired: boolean;
  connectError: string | null;
  onRefresh: () => void;
}) {
  return (
    <div style={{
      background: "#fff",
      border: connected ? "1px solid #BBF7D0" : "1px solid #E5E7EB",
      borderRadius: 12, padding: 18,
      display: "flex", flexDirection: "column", gap: 14,
      boxShadow: "0 1px 3px rgba(15,23,42,0.04)", transition: "all 160ms",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: connected ? "#F0FDF4" : "#F1F5F9",
          border: `1px solid ${connected ? "#BBF7D0" : "#E5E7EB"}`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Mail size={18} color={connected ? "#15803d" : "#64748b"} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{name}</div>
            <SBadge tone="blue">Required for sending</SBadge>
          </div>
          <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11, color: "#94a3b8", marginTop: 2, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600 }}>{category}</div>
        </div>
        <SBadge tone={connected ? "green" : cardState === "loading" ? "slate" : "slate"} dot>
          {connected ? "Connected" : cardState === "loading" ? "Checking…" : "Not connected"}
        </SBadge>
      </div>

      {/* Description */}
      <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12.5, color: "#475569", lineHeight: 1.55 }}>{description}</div>

      {/* Connected account chip */}
      {connected && account && (
        <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle2 size={14} color="#22c55e" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 12, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {account}
            </div>
          </div>
        </div>
      )}

      {/* Setup required notice */}
      {localSetupRequired && (
        <div style={{ borderRadius: 8, border: "1px solid #FDE68A", background: "#FFFBEB", padding: "10px 12px", fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#b45309" }}>
          {name} connection function is not deployed yet.
        </div>
      )}

      {/* Error notice */}
      {connectError && (
        <div style={{ borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", padding: "10px 12px", fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#b91c1c" }}>
          {connectError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        {connected ? (
          <>
            <button style={{ ...sBtnGhost, flex: 1, justifyContent: "center" }} onClick={onConnect} disabled={connecting}>
              {connecting ? <><RefreshCw size={12} /> Reconnecting…</> : <><RefreshCw size={12} /> Reconnect</>}
            </button>
            <button style={{ ...sBtnDanger, flex: 1, justifyContent: "center" }} disabled>
              Disconnect · setup required
            </button>
          </>
        ) : localSetupRequired ? (
          <button style={{ ...sBtnGhost, flex: 1, justifyContent: "center" }} onClick={onRefresh}>
            <RefreshCw size={12} /> Refresh status
          </button>
        ) : (
          <>
            <button
              style={{ ...sBtnPrimary, flex: 1, justifyContent: "center", opacity: connecting ? 0.7 : 1 }}
              onClick={onConnect}
              disabled={connecting}
            >
              {connecting ? <><RefreshCw size={13} /> Connecting…</> : <><Mail size={13} /> Connect {name.split(" ")[0]}</>}
            </button>
            <button style={{ ...sBtnGhost, padding: "7px 10px" }} onClick={onRefresh} disabled={connecting}>
              <RefreshCw size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GmailCard({
  accounts,
  loadingAccounts,
  onRefresh,
}: {
  accounts: LitEmailAccountRow[];
  loadingAccounts: boolean;
  onRefresh: () => void;
}) {
  const { orgId } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [localSetupRequired, setLocalSetupRequired] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const gmailAccount = accounts.find((a) => a.provider === "gmail" && a.status === "connected");

  let cardState: ProviderCardState = "not_connected";
  if (loadingAccounts) cardState = "loading";
  else if (localSetupRequired) cardState = "setup_required";
  else if (gmailAccount) cardState = "connected";

  async function handleConnect() {
    setConnecting(true); setConnectError(null); setLocalSetupRequired(false);
    const result = await startGmailOAuth(orgId);
    setConnecting(false);
    if ("url" in result) { window.location.href = result.url; return; }
    if ("setupRequired" in result) { setLocalSetupRequired(true); return; }
    if ("configError" in result) { setConnectError("Integration service unavailable. Check Supabase configuration."); return; }
    setConnectError((result as any).error);
  }

  return (
    <IntegrationCard
      name="Gmail"
      category="Inbox / Sending"
      description="Send outbound directly from your Gmail account. LIT never exposes OAuth tokens in the browser."
      connected={cardState === "connected"}
      account={gmailAccount?.email ?? null}
      cardState={cardState}
      onConnect={handleConnect}
      connecting={connecting}
      localSetupRequired={localSetupRequired}
      connectError={connectError}
      onRefresh={onRefresh}
    />
  );
}

function OutlookCard({
  accounts,
  loadingAccounts,
  onRefresh,
}: {
  accounts: LitEmailAccountRow[];
  loadingAccounts: boolean;
  onRefresh: () => void;
}) {
  const { orgId } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [localSetupRequired, setLocalSetupRequired] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const outlookAccount = accounts.find((a) => a.provider === "outlook" && a.status === "connected");
  const connected = Boolean(outlookAccount) && !loadingAccounts;
  const cardState: ProviderCardState = loadingAccounts ? "loading" : localSetupRequired ? "setup_required" : connected ? "connected" : "not_connected";

  async function handleConnect() {
    setConnecting(true); setConnectError(null); setLocalSetupRequired(false);
    const result = await startOutlookOAuth(orgId);
    setConnecting(false);
    if ("url" in result) { window.location.href = result.url; return; }
    if ("setupRequired" in result) { setLocalSetupRequired(true); return; }
    if ("configError" in result) { setConnectError("Integration service unavailable. Check Supabase configuration."); return; }
    setConnectError((result as any).error);
  }

  return (
    <IntegrationCard
      name="Outlook"
      category="Inbox / Sending"
      description="Send outbound from your Microsoft 365 / Outlook account. Recommended for freight forwarders and enterprise teams."
      connected={connected}
      account={outlookAccount?.email ?? null}
      cardState={cardState}
      onConnect={handleConnect}
      connecting={connecting}
      localSetupRequired={localSetupRequired}
      connectError={connectError}
      onRefresh={onRefresh}
    />
  );
}

// ─── Test send control ────────────────────────────────────────────────────────
function TestSendControl({ fromEmail }: { fromEmail: string }) {
  const [toEmail, setToEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; message: string }
    | { ok: false; message: string }
    | { setupRequired: true }
    | null
  >(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const target = toEmail.trim() || fromEmail;
    setSending(true); setResult(null);
    const res = await sendTestEmail(target);
    setSending(false);
    if ("ok" in res && res.ok) {
      setResult({ ok: true, message: "Test sent — check your inbox" });
    } else if ("setupRequired" in res) {
      setResult({ setupRequired: true });
    } else if ("configError" in res) {
      setResult({ ok: false, message: "Integration service unavailable." });
    } else {
      setResult({ ok: false, message: (res as any).error || "Send failed" });
    }
  }

  if (result && "setupRequired" in result) {
    return (
      <div style={{ marginTop: 14, borderRadius: 8, border: "1px solid #FDE68A", background: "#FFFBEB", padding: "10px 12px", fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#b45309" }}>
        Test send setup required — <code style={{ fontFamily: "JetBrains Mono,monospace" }}>send-test-email</code> function is not deployed yet.
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} style={{ marginTop: 14, borderRadius: 8, border: "1px solid #F1F5F9", background: "#F8FAFC", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
        Test send
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <SInput
          type="email"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          placeholder={fromEmail}
          style={{ flex: 1, fontSize: 12 }}
          disabled={sending}
        />
        <button type="submit" disabled={sending} style={sBtnPrimary}>
          {sending ? <><RefreshCw size={13} /> Sending…</> : <><Send size={13} /> Send</>}
        </button>
      </div>
      {result && "ok" in result && (
        <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11.5, color: result.ok ? "#15803d" : "#b91c1c" }}>
          {result.message}
        </div>
      )}
    </form>
  );
}

// ─── Email readiness panel ────────────────────────────────────────────────────
function EmailReadinessPanel({
  accounts,
  loading,
  known,
  primaryEmail,
}: {
  accounts: LitEmailAccountRow[];
  loading: boolean;
  known: boolean;
  primaryEmail: string | null;
}) {
  if (!known && !loading) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 12, border: "1px solid #E5E7EB", background: "#fff", padding: 18, boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <WifiOff size={16} color="#94a3b8" style={{ marginTop: 2 }} />
        <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#64748b" }}>
          We can&rsquo;t read your mailbox status right now. Try refreshing the page or contact support if this persists.
        </div>
      </div>
    );
  }

  const hasMailbox = accounts.length > 0;
  const hasPrimary = Boolean(primaryEmail);
  const connectedAccount = accounts.find((a) => a.status === "connected");
  const anyOk = hasMailbox;

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "18px 20px", display: "flex", alignItems: "center", gap: 20, boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div style={{
        width: 52, height: 52, borderRadius: 12, flexShrink: 0,
        background: anyOk ? "linear-gradient(135deg,#DCFCE7,#BBF7D0)" : "linear-gradient(135deg,#FEE2E2,#FECACA)",
        border: `1px solid ${anyOk ? "#BBF7D0" : "#FECACA"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {anyOk
          ? <CheckCircle2 size={22} color="#15803d" />
          : <AlertTriangle size={22} color="#b91c1c" />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 15, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" }}>
          Campaign sending:{" "}
          <span style={{ color: anyOk ? "#15803d" : "#b91c1c" }}>
            {loading ? "Checking…" : anyOk ? "Ready" : "Blocked"}
          </span>
        </div>
        <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
          {anyOk
            ? `${connectedAccount?.email || "Inbox"} connected. Outbound engine ready.`
            : "Connect Gmail or Outlook to enable outbound sends. Campaigns will stay in draft until an inbox is linked."}
        </div>
        {connectedAccount && <TestSendControl fromEmail={connectedAccount.email} />}
      </div>
      <div className="lit-readiness" style={{ display: "flex", gap: 12, flexShrink: 0 }}>
        <ReadinessDot ok={!loading && hasMailbox} label="Mailbox" />
        <ReadinessDot ok={!loading && hasPrimary} label="Primary" />
        <ReadinessDot ok={false} label="Test send" />
        <ReadinessDot ok={false} label="Reply tracking" />
      </div>
    </div>
  );
}

// ─── EmailAccountsSection ─────────────────────────────────────────────────────
export function EmailAccountsSection({
  integrations,
  onDisconnect,
}: {
  integrations?: Array<{ id?: string; integration_type?: string; type?: string; status?: string; external_id?: string }>;
  onDisconnect?: (id: string) => Promise<void> | void;
}) {
  const [accounts, setAccounts] = useState<LitEmailAccountRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const { primaryEmail, known, loading: inboxLoading, refresh: refreshInbox } = useInboxStatus();

  const refreshAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const list = await listEmailAccounts();
      setAccounts(list);
    } catch { setAccounts([]); }
    finally { setLoadingAccounts(false); }
  };

  useEffect(() => { void refreshAccounts(); }, []);

  const handleRefresh = async () => {
    await Promise.all([refreshAccounts(), refreshInbox()]);
  };

  const noInbox = !loadingAccounts && accounts.filter((a) => a.status === "connected").length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Critical red banner if no inbox connected */}
      {noInbox && (
        <div style={{
          background: "linear-gradient(180deg,#FEF2F2,#FFFBFA)",
          border: "1px solid #FECACA", borderRadius: 12, padding: "14px 18px",
          display: "flex", gap: 12, alignItems: "flex-start",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: "#FEE2E2",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <AlertTriangle size={15} color="#b91c1c" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13.5, fontWeight: 700, color: "#7f1d1d" }}>No inbox connected</div>
            <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12.5, color: "#991b1b", marginTop: 3 }}>
              Campaigns can&rsquo;t send until you connect Gmail or Outlook. This is the #1 blocker for outreach launches.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(420px,1fr))", gap: 14 }}>
        <GmailCard accounts={accounts} loadingAccounts={loadingAccounts} onRefresh={handleRefresh} />
        <OutlookCard accounts={accounts} loadingAccounts={loadingAccounts} onRefresh={handleRefresh} />
      </div>

      <EmailReadinessPanel
        accounts={accounts}
        loading={loadingAccounts || inboxLoading}
        known={known}
        primaryEmail={primaryEmail}
      />
    </div>
  );
}

// ─── IntegrationsHubSection ───────────────────────────────────────────────────
export function IntegrationsHubSection(props: {
  integrations?: Array<{ id?: string; integration_type?: string; type?: string; status?: string; external_id?: string }>;
  onDisconnect?: (id: string) => Promise<void> | void;
  isPartner?: boolean;
}) {
  const wired = Array.isArray(props.integrations) ? props.integrations : [];
  const enrichmentTypes = new Set(["apollo", "lusha", "hunter"]);
  const enrichmentRows = wired.filter((r) => {
    const k = String(r?.integration_type || r?.type || "").toLowerCase();
    return enrichmentTypes.has(k);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader
        title="Integrations"
        subtitle="Connect your inboxes, enrichment providers, and data sources. Inbox connections power the Outbound Engine."
      />

      <EmailAccountsSection
        integrations={props.integrations}
        onDisconnect={props.onDisconnect}
      />

      {/* Enrichment card */}
      <SCard
        title="Enrichment"
        subtitle="Apollo, Lusha, or Hunter contact enrichment providers."
        right={
          <SBadge tone={enrichmentRows.length > 0 ? "green" : "slate"} dot>
            {enrichmentRows.length > 0 ? `${enrichmentRows.length} connected` : "Not connected"}
          </SBadge>
        }
      >
        {enrichmentRows.length === 0 ? (
          <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12.5, color: "#64748b" }}>
            Enrichment runs through your workspace admin&rsquo;s API keys today.
            User-level enrichment provider connections ship in a future release.
          </div>
        ) : (
          <div>
            {enrichmentRows.map((row, i) => {
              const k = String(row?.integration_type || row?.type || "").toLowerCase();
              const label = k.charAt(0).toUpperCase() + k.slice(1);
              return (
                <div key={row.id || k} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "10px 0", borderBottom: i < enrichmentRows.length - 1 ? "1px solid #F1F5F9" : "none",
                }}>
                  <div>
                    <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{label}</div>
                    <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: "#94a3b8" }}>{row.external_id || "Connected"}</div>
                  </div>
                  {row.id && props.onDisconnect && (
                    <button onClick={() => props.onDisconnect!(row.id as string)} style={{ ...sBtnGhost, fontSize: 12, padding: "6px 11px" }}>
                      <Trash2 size={12} /> Disconnect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SCard>

      {/* Stripe Connect partner block */}
      {props.isPartner && (
        <SCard>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Coins size={16} color="#1d4ed8" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Stripe Connect — partner payouts</div>
              <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
                Manage your partner payout account and view connection status from the Affiliate dashboard.
              </div>
            </div>
            <a
              href="/app/affiliate"
              style={{ ...sBtnPrimary, textDecoration: "none" }}
            >
              Manage payouts <ExternalLink size={12} />
            </a>
          </div>
        </SCard>
      )}
    </div>
  );
}

// ─── PreferencesSection ───────────────────────────────────────────────────────
export function PreferencesSection(props: {
  timezone?: string;
  emailSignature?: string;
  onSaveTimezone?: (tz: string) => Promise<{ error?: string } | void>;
  onSaveEmailSignature?: (sig: string) => Promise<{ error?: string } | void>;
}) {
  const [tz, setTz] = useState(props.timezone || "");
  const [sig, setSig] = useState(props.emailSignature || "");
  const [savingTz, setSavingTz] = useState(false);
  const [savingSig, setSavingSig] = useState(false);
  const [tzMsg, setTzMsg] = useState<string | null>(null);
  const [sigMsg, setSigMsg] = useState<string | null>(null);

  useEffect(() => { setTz(props.timezone || ""); }, [props.timezone]);
  useEffect(() => { setSig(props.emailSignature || ""); }, [props.emailSignature]);

  async function saveTz() {
    if (!props.onSaveTimezone) return;
    setSavingTz(true); setTzMsg(null);
    const r = await props.onSaveTimezone(tz.trim());
    setSavingTz(false);
    setTzMsg(r && (r as any).error ? `Could not save: ${(r as any).error}` : "Saved.");
    setTimeout(() => setTzMsg(null), 2500);
  }

  async function saveSig() {
    if (!props.onSaveEmailSignature) return;
    setSavingSig(true); setSigMsg(null);
    const r = await props.onSaveEmailSignature(sig);
    setSavingSig(false);
    setSigMsg(r && (r as any).error ? `Could not save: ${(r as any).error}` : "Saved.");
    setTimeout(() => setSigMsg(null), 2500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader title="Preferences" subtitle="Personal defaults for time, email signature, and search." />

      <SCard title="Timezone" subtitle="Display dates and reset times in this timezone.">
        <SField label="IANA timezone identifier">
          <SInput
            type="text"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="America/New_York"
          />
        </SField>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <button onClick={saveTz} disabled={savingTz} style={sBtnPrimary}>
            {savingTz ? "Saving…" : "Save timezone"}
          </button>
          {tzMsg && <span style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#64748b" }}>{tzMsg}</span>}
        </div>
      </SCard>

      <SCard title="Email signature" subtitle="Appended to every outbound campaign email.">
        <STextarea
          rows={4}
          value={sig}
          onChange={(e) => setSig(e.target.value)}
          placeholder={"— Jane Smith\nLogistic Intel\nyour-email@company.com"}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <button onClick={saveSig} disabled={savingSig} style={sBtnPrimary}>
            {savingSig ? "Saving…" : "Save signature"}
          </button>
          {sigMsg && <span style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "#64748b" }}>{sigMsg}</span>}
        </div>
      </SCard>

      {/* Coming soon card */}
      <div style={{
        borderRadius: 12, border: "1px dashed #CBD5E1", background: "#fff",
        padding: "18px 20px",
      }}>
        <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
          Default search filters
        </div>
        <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12.5, color: "#64748b" }}>
          Coming soon — pin lane, mode, or country filters so they apply by default whenever you open Search.
        </div>
      </div>
    </div>
  );
}

