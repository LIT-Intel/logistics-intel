// SettingsProfile.tsx — Admin Control Panel re-skin of the Profile section.
//
// NOTE: This is a presentation-layer copy of ProfileSection from
// SettingsSections.tsx (same props, same save handlers, same data flow).
// It exists as a separate file because SettingsSections.tsx exceeds the
// write-tool payload limit for a full-file update; the original component
// is left untouched in place as the rollback reference. If the payload
// limit is ever lifted, this should be folded back into SettingsSections.tsx
// and this file removed.
import React, { useEffect, useState, useRef } from "react";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  SCard,
  SToggle,
  SBadge,
  StatusMsg,
} from "./SettingsPrimitives";

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


type ProfileSectionProps = {
  initialData?: {
    name?: string;
    email?: string;
    emailVerified?: boolean;
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
  /** Navigate to the Security tab (used by the 2FA banner's Enable button). */
  onOpenSecurity?: () => void;
};

const BIO_MAX = 160;

export function ProfileSection({
  initialData,
  messagingPrefs,
  onSave,
  onUploadAvatar,
  onSaveMessagingPreferences,
  onOpenSecurity,
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
      <StatusMsg error={error} success={success} />

      <div className="lit-profile-card">
        <div className="lit-profile-cover">
          <button
            type="button"
            className="lit-profile-cover-btn"
            disabled
            title="Cover photos are coming soon"
          >
            Change cover
          </button>
        </div>
        <div className="lit-profile-card-body">
          <div className="lit-profile-avatar-row">
            <div
              className="lit-profile-avatar"
              style={avatarUrl ? { background: `url(${avatarUrl}) center/cover` } : undefined}
            >
              {!avatarUrl && initials}
            </div>
            <div className="lit-profile-avatar-meta">
              <div className="lit-profile-breadcrumb">
                Settings <span className="sep">/</span> <span className="current">Profile</span>
              </div>
              <h2 className="lit-profile-title">Your profile</h2>
              <p className="lit-profile-subtitle">
                Keep your personal information up to date and consistent across your workspace.
              </p>
            </div>
            <div className="lit-profile-upload-btn">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleAvatarChange}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="lit-btn-ghost"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar || !onUploadAvatar}
                style={{ width: "100%", opacity: uploadingAvatar || !onUploadAvatar ? 0.6 : 1 }}
              >
                <Upload size={13} /> {uploadingAvatar ? "Uploading…" : "Upload photo"}
              </button>
            </div>
          </div>

          {/* 2FA warning — 2FA is not implemented yet, so this banner has no
              live state to bind to; it always shows until MFA ships. */}
          <div className="lit-alert lit-alert-amber" role="alert">
            <AlertTriangle size={16} className="lit-alert-icon" />
            <div className="lit-alert-body">
              <strong>You haven&apos;t enabled two-factor authentication (2FA).</strong>
              <br />
              Add an extra layer of security to your account.
            </div>
            <button type="button" className="lit-alert-action" onClick={() => onOpenSecurity?.()}>
              Enable
            </button>
          </div>

          {initialData?.emailVerified && (
            <div className="lit-alert lit-alert-green" role="status">
              <CheckCircle2 size={16} className="lit-alert-icon" />
              <div className="lit-alert-body">
                <strong>Your email address has been verified successfully.</strong>
              </div>
            </div>
          )}

          <div className="lit-profile-form">
            <div>
              <label className="lit-field-label" htmlFor="pf-name">
                Full name <span className="req">*</span>
              </label>
              <input
                id="pf-name"
                className="lit-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="lit-field-label" htmlFor="pf-title">Job title</label>
              <input
                id="pf-title"
                className="lit-input"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. VP of Sales"
              />
            </div>
            <div>
              <label className="lit-field-label" htmlFor="pf-email">Email</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  id="pf-email"
                  className="lit-input"
                  value={initialData?.email || ""}
                  readOnly
                  style={{ opacity: 0.6 }}
                />
                {initialData?.emailVerified && <SBadge tone="green">Verified</SBadge>}
              </div>
              <div className="lit-field-hint">Primary login email</div>
            </div>
            <div>
              <label className="lit-field-label" htmlFor="pf-phone">Phone</label>
              <input
                id="pf-phone"
                className="lit-input"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div>
              <label className="lit-field-label" htmlFor="pf-location">Location</label>
              <input
                id="pf-location"
                className="lit-input"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="City, Country"
              />
            </div>
            <div>
              <label className="lit-field-label" htmlFor="pf-timezone">Timezone</label>
              <select
                id="pf-timezone"
                className="lit-select"
                value={form.timezone}
                onChange={(e) => setForm((p) => ({ ...p, timezone: (e.target as HTMLSelectElement).value }))}
              >
                <option value="">Select timezone…</option>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="span-2">
              <label className="lit-field-label" htmlFor="pf-bio">Short bio</label>
              <textarea
                id="pf-bio"
                className="lit-textarea"
                rows={2}
                value={form.bio}
                maxLength={BIO_MAX}
                onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                placeholder="VP Sales @ Logistic Intel. 12 years closing ocean freight RFPs."
              />
              <div className="lit-field-hint">
                160 chars max. Shown on your outbound signature and teammate cards.
              </div>
            </div>
          </div>

          <div className="lit-profile-save-row">
            <button
              type="button"
              className="lit-btn-ghost"
              onClick={() => setForm(initial)}
              disabled={!dirty || saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="lit-btn-primary"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Messaging preferences — collapsible since this is a "set once,
          rarely revisit" surface. */}
      <SCard
        title="Messaging preferences"
        subtitle="How teammates and automated systems contact you inside the app."
        collapsible
        defaultOpen={false}
      >
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

