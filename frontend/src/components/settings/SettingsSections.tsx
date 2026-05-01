import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  User,
  Building2,
  Mail,
  Linkedin,
  ShieldCheck,
  CreditCard,
  FileText,
  Megaphone,
  Bell,
  KeyRound,
  Coins,
  Users,
  Upload,
  Trash2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Plug,
  Send,
  Gift,
  ExternalLink,
  Lock,
  RefreshCw,
  WifiOff,
  Link as LinkIcon,
  AlertTriangle,
} from "lucide-react";
import { PLAN_LIMITS, normalizePlan as normalizePlanCode } from "@/lib/planLimits";
import { listEmailAccounts, startGmailOAuth } from "@/lib/api";
import { useInboxStatus } from "@/features/outbound/hooks/useInboxStatus";
import type { LitEmailAccountRow } from "@/types/lit-outbound";
import {
  SCard,
  SectionHeader,
  Pill,
  SToggle,
  RawToggle,
  BtnPrimary,
  BtnGhost,
  BtnDanger,
  BtnDark,
  SInput,
  STextarea,
  SSelect,
  SField,
  StatusMsg,
} from "./SettingsPrimitives";
import { ob } from "@/features/outbound/tokens";

// User-facing /app/settings exposes six tabs. The legacy admin-only
// sections (Outreach Accounts, Campaign Preferences, RFP & Pipeline,
// Affiliate Program, Organization config, Billing config) are still
// exported for use by the admin route — only the visible nav here is
// curated.
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

// Local section wrapper — uses SectionHeader + consistent gap
function SectionShell({
  title,
  description,
  kicker,
  children,
  right,
}: {
  title: string;
  description?: string;
  kicker?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        kicker={kicker || "SETTINGS"}
        title={title}
        description={description}
        right={right}
      />
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// Thin adapters so old callers keep working while using new primitives
function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return <SField label={label} required={required}>{children}</SField>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <SInput {...props} />;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <STextarea {...props} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <SSelect {...props} />;
}

function ActionButton({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  if (variant === "danger") return <BtnDanger {...props}>{children}</BtnDanger>;
  if (variant === "secondary") return <BtnGhost {...props}>{children}</BtnGhost>;
  return <BtnPrimary {...props}>{children}</BtnPrimary>;
}

function StatusMessage({ error, success }: { error?: string | null; success?: string | null }) {
  return <StatusMsg error={error} success={success} />;
}

type MessagingKey = "mentions" | "weekly_digest" | "direct_messages" | "assignments";

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

const BIO_MAX_CHARS = 160;

// Common IANA zones surfaced in the picker. Persists the raw IANA ID so
// server-side scheduling keeps working if we wire it later.
const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "America/Denver", label: "America/Denver" },
  { value: "America/Chicago", label: "America/Chicago" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
];

// MessagingTile now delegates to SToggle from SettingsPrimitives
function MessagingTile({
  label,
  description,
  on,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <SToggle
      title={label}
      description={description}
      on={on}
      onToggle={onToggle}
      disabled={disabled}
    />
  );
}

const MESSAGING_ROWS: Array<{ key: MessagingKey; label: string; description: string }> = [
  { key: "mentions", label: "@mentions in comments", description: "Email me when teammates tag me." },
  { key: "weekly_digest", label: "Weekly digest", description: "Monday morning summary of pipeline." },
  { key: "direct_messages", label: "Direct messages", description: "In-app DMs from workspace members." },
  { key: "assignments", label: "Assignments", description: "Notify when a deal is routed to me." },
];

function defaultMessagingPrefs(): Record<MessagingKey, boolean> {
  return { mentions: true, weekly_digest: true, direct_messages: true, assignments: true };
}

function normalizeMessagingPrefs(
  input?: Partial<Record<MessagingKey, boolean>>,
): Record<MessagingKey, boolean> {
  const base = defaultMessagingPrefs();
  if (!input) return base;
  for (const row of MESSAGING_ROWS) {
    if (typeof input[row.key] === "boolean") base[row.key] = input[row.key] as boolean;
  }
  return base;
}

export function ProfileSection({
  initialData,
  messagingPrefs,
  onSave,
  onUploadAvatar,
  onSaveMessagingPreferences,
  isAdmin,
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
  const [avatarUrl, setAvatarUrl] = useState(initialData?.avatar_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [msg, setMsg] = useState<Record<MessagingKey, boolean>>(() =>
    normalizeMessagingPrefs(messagingPrefs),
  );
  const [msgSaving, setMsgSaving] = useState<MessagingKey | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);

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
    setAvatarUrl(initialData?.avatar_url || "");
  }, [
    initialData?.name,
    initialData?.title,
    initialData?.phone,
    initialData?.location,
    initialData?.timezone,
    initialData?.bio,
    initialData?.avatar_url,
  ]);

  useEffect(() => {
    setMsg(normalizeMessagingPrefs(messagingPrefs));
  }, [messagingPrefs]);

  const dirty =
    form.name !== initial.name ||
    form.title !== initial.title ||
    form.phone !== initial.phone ||
    form.location !== initial.location ||
    form.timezone !== initial.timezone ||
    form.bio !== initial.bio;

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await onSave?.(form);
      if ((result as any)?.error) {
        setError((result as any).error);
      } else {
        setSuccess("Profile saved");
        setInitial(form);
      }
    } catch (e: any) {
      setError(e?.message || "Failed saving profile");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm(initial);
    setError(null);
    setSuccess(null);
  }

  async function handleAvatarChange(file?: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await onUploadAvatar?.(file);
      if ((result as any)?.error) {
        setError((result as any).error);
      } else {
        setSuccess("Profile image updated");
      }
    } catch (e: any) {
      setError(e?.message || "Failed uploading avatar");
    } finally {
      setUploading(false);
    }
  }

  async function toggleMessaging(key: MessagingKey) {
    if (!onSaveMessagingPreferences) return;
    const optimistic = { ...msg, [key]: !msg[key] };
    setMsg(optimistic);
    setMsgError(null);
    setMsgSaving(key);
    try {
      const result = await onSaveMessagingPreferences(optimistic);
      if ((result as any)?.error) {
        setMsg(msg);
        setMsgError((result as any).error);
      }
    } catch (e: any) {
      setMsg(msg);
      setMsgError(e?.message || "Failed updating preference");
    } finally {
      setMsgSaving(null);
    }
  }

  const initials =
    (initialData?.name || initialData?.email || "U")
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return (
    <div className="space-y-4">
      <StatusMessage error={error || msgError} success={success} />

      {/* Identity card */}
      <SCard
        title="Identity"
        subtitle="Public profile details visible to your workspace and in outbound signatures."
      >
        <div className="grid gap-6 md:grid-cols-[140px_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-3">
            <div
              aria-label={avatarUrl ? "Profile image" : `Initials avatar ${initials}`}
              className="flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-blue-700 shadow"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-3xl font-bold text-white">{initials}</span>
              )}
            </div>
            <button
              type="button"
              disabled
              title="Photo upload ships with the storage integration"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-display text-[11px] font-semibold text-slate-400"
            >
              <Upload className="h-3 w-3" />
              Change photo · soon
            </button>
          </div>

          <div className="space-y-3.5">
            <div className="grid gap-3 md:grid-cols-2">
              <SField label="Full name" required>
                <SInput
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </SField>
              <SField label="Job title">
                <SInput
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                />
              </SField>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <SField label="Email">
                <SInput
                  type="email"
                  value={initialData?.email || ""}
                  readOnly
                  className="cursor-not-allowed opacity-60"
                />
                <p className="font-body text-[11.5px]" style={{ color: ob.successFg }}>Primary login email — verified</p>
              </SField>
              <SField label="Phone">
                <SInput
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </SField>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <SField label="Location">
                <SInput
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                />
              </SField>
              <SField label="Timezone">
                <SSelect
                  value={form.timezone}
                  onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                >
                  <option value="">Select timezone…</option>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </SSelect>
              </SField>
            </div>

            <SField label="Short bio">
              <STextarea
                rows={3}
                maxLength={BIO_MAX_CHARS}
                value={form.bio}
                onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
              />
              <p className="font-body text-[11.5px] text-slate-400">
                {BIO_MAX_CHARS} chars max. Shown on your outbound signature and teammate cards.
              </p>
            </SField>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <BtnGhost
            type="button"
            onClick={handleCancel}
            disabled={saving || !dirty}
          >
            Cancel
          </BtnGhost>
          <BtnDark
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save changes"}
          </BtnDark>
        </div>
      </SCard>

      {/* Messaging preferences */}
      <SCard
        title="Messaging preferences"
        subtitle="How teammates and automated systems contact you inside the app."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {MESSAGING_ROWS.map((row) => (
            <MessagingTile
              key={row.key}
              label={row.label}
              description={row.description}
              on={msg[row.key]}
              onToggle={() => toggleMessaging(row.key)}
              disabled={msgSaving !== null && msgSaving !== row.key}
            />
          ))}
        </div>
      </SCard>

      {/* Account handoff */}
      <SCard title="Account">
        <p className="font-body text-[13px] text-slate-500 leading-relaxed">
          Session, password reset, and two-factor security are managed
          through your account email — sign-in flow handles all of those
          today.
        </p>
      </SCard>
    </div>
  );
}

type CompanySignatureSectionProps = {
  orgProfile?: {
    id?: string | null;
    name?: string;
    company?: string;
    tagline?: string;
    website?: string;
    industry?: string;
    size?: string;
    logo_url?: string;
    supportEmail?: string;
    address?: string;
    timezone?: string;
  };
  emailSignature?: string;
  onSaveOrg?: (data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onSaveSignature?: (sig: string) => Promise<{ error?: string } | void>;
  onUploadLogo?: (file: File) => Promise<{ error?: string } | void>;
};

export function CompanySignatureSection({
  orgProfile,
  emailSignature,
  onSaveOrg,
  onSaveSignature,
  onUploadLogo,
}: CompanySignatureSectionProps) {
  const [form, setForm] = useState({
    company: orgProfile?.company || orgProfile?.name || "",
    tagline: orgProfile?.tagline || "",
    website: orgProfile?.website || "",
    industry: orgProfile?.industry || "",
    size: orgProfile?.size || "",
    supportEmail: orgProfile?.supportEmail || "",
    address: orgProfile?.address || "",
    timezone: orgProfile?.timezone || "",
  });
  const [signature, setSignature] = useState(emailSignature || "");
  const [logoUrl, setLogoUrl] = useState(orgProfile?.logo_url || "");
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setForm({
      company: orgProfile?.company || orgProfile?.name || "",
      tagline: orgProfile?.tagline || "",
      website: orgProfile?.website || "",
      industry: orgProfile?.industry || "",
      size: orgProfile?.size || "",
      supportEmail: orgProfile?.supportEmail || "",
      address: orgProfile?.address || "",
      timezone: orgProfile?.timezone || "",
    });
    setSignature(emailSignature || "");
    setLogoUrl(orgProfile?.logo_url || "");
  }, [
    orgProfile?.id,
    orgProfile?.name,
    orgProfile?.company,
    orgProfile?.tagline,
    orgProfile?.website,
    orgProfile?.industry,
    orgProfile?.size,
    orgProfile?.supportEmail,
    orgProfile?.address,
    orgProfile?.timezone,
    orgProfile?.logo_url,
    emailSignature,
  ]);

  async function handleSaveOrg() {
    setSavingOrg(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await onSaveOrg?.(form);
      if ((result as any)?.error) setError((result as any).error);
      else setSuccess("Company profile saved");
    } catch (e: any) {
      setError(e?.message || "Failed saving company profile");
    } finally {
      setSavingOrg(false);
    }
  }

  async function handleSaveSignature() {
    setSavingSignature(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await onSaveSignature?.(signature);
      if ((result as any)?.error) setError((result as any).error);
      else setSuccess("Email signature saved");
    } catch (e: any) {
      setError(e?.message || "Failed saving email signature");
    } finally {
      setSavingSignature(false);
    }
  }

  async function handleLogoChange(file?: File | null) {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await onUploadLogo?.(file);
      if ((result as any)?.error) setError((result as any).error);
      else setSuccess("Company logo updated");
    } catch (e: any) {
      setError(e?.message || "Failed uploading logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <SectionShell
      title="Company & signature"
      description="Keep workspace branding and email signature settings current."
    >
      <StatusMessage error={error} success={success} />
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              className="group relative mb-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-white shadow"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-10 w-10 text-slate-400" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                Change
              </div>
            </button>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogoChange(e.target.files?.[0])}
            />
            <div className="text-lg font-semibold text-slate-900">{form.company || "Organization"}</div>
            <div className="mt-1 text-sm text-slate-500">{form.website || "No website saved"}</div>
            <div className="mt-4 w-full">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => logoRef.current?.click()}
                disabled={uploadingLogo}
                className="w-full"
              >
                <Upload size={16} />
                {uploadingLogo ? "Uploading..." : "Upload logo"}
              </ActionButton>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Company name">
                <Input value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} />
              </Field>
              <Field label="Tagline">
                <Input value={form.tagline} onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))} />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} />
              </Field>
              <Field label="Industry">
                <Input value={form.industry} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))} />
              </Field>
              <Field label="Company size">
                <Input value={form.size} onChange={(e) => setForm((p) => ({ ...p, size: e.target.value }))} />
              </Field>
              <Field label="Support email">
                <Input
                  value={form.supportEmail}
                  onChange={(e) => setForm((p) => ({ ...p, supportEmail: e.target.value }))}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address">
                  <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                </Field>
              </div>
              <Field label="Timezone">
                <Input
                  value={form.timezone}
                  onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <ActionButton onClick={handleSaveOrg} disabled={savingOrg}>
                {savingOrg ? "Saving..." : "Save company"}
              </ActionButton>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <Field label="Email signature">
              <Textarea rows={7} value={signature} onChange={(e) => setSignature(e.target.value)} />
            </Field>
            <div className="mt-5 flex justify-end">
              <ActionButton onClick={handleSaveSignature} disabled={savingSignature}>
                {savingSignature ? "Saving..." : "Save signature"}
              </ActionButton>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

export function EmailSection({
  integrations,
  preferences,
  onSavePreferences,
  onDisconnect,
}: any) {
  const [state, setState] = useState({
    replyTo: preferences?.replyTo || "",
    senderName: preferences?.senderName || "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setState({
      replyTo: preferences?.replyTo || "",
      senderName: preferences?.senderName || "",
    });
  }, [preferences]);

  const inboxes = useMemo(
    () =>
      (integrations || []).filter(
        (i: any) => (i.type || i.integration_type) === "gmail" || (i.type || i.integration_type) === "outlook"
      ),
    [integrations]
  );

  return (
    <SectionShell title="Email" description="Manage sending defaults and connected inboxes.">
      {msg ? <StatusMessage success={msg} /> : null}
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Sender name">
            <Input value={state.senderName} onChange={(e) => setState((p) => ({ ...p, senderName: e.target.value }))} />
          </Field>
          <Field label="Reply-to address">
            <Input value={state.replyTo} onChange={(e) => setState((p) => ({ ...p, replyTo: e.target.value }))} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <ActionButton
            onClick={async () => {
              await onSavePreferences?.(state);
              setMsg("Email preferences saved");
            }}
          >
            Save email settings
          </ActionButton>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-4 text-sm font-semibold text-slate-900">Connected inboxes</div>
        <div className="space-y-3">
          {inboxes.length ? (
            inboxes.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                <div>
                  <div className="font-medium text-slate-900">{item.integration_type || item.type}</div>
                  <div className="text-sm text-slate-500">Connected</div>
                </div>
                <ActionButton variant="danger" onClick={() => onDisconnect?.(item.id)}>
                  Disconnect
                </ActionButton>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No connected inboxes yet.
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}

export function LinkedInSection({ preferences, onSavePreferences }: any) {
  const [state, setState] = useState({
    sender: preferences?.sender || "",
    personalization: preferences?.personalization || "",
  });

  useEffect(() => {
    setState({
      sender: preferences?.sender || "",
      personalization: preferences?.personalization || "",
    });
  }, [preferences]);

  return (
    <SectionShell title="LinkedIn" description="Set your default LinkedIn outreach preferences.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4">
          <Field label="Default sender">
            <Input value={state.sender} onChange={(e) => setState((p) => ({ ...p, sender: e.target.value }))} />
          </Field>
          <Field label="Personalization prompt">
            <Textarea rows={5} value={state.personalization} onChange={(e) => setState((p) => ({ ...p, personalization: e.target.value }))} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <ActionButton onClick={() => onSavePreferences?.(state)}>Save LinkedIn settings</ActionButton>
        </div>
      </div>
    </SectionShell>
  );
}

export function AccessRolesSection({
  members = [],
  invites = [],
  seatLimit,
  onInvite,
  onRevoke,
  onUpdateRole,
  onRevokeInvite,
  isAdmin,
}: any) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <StatusMessage error={err} success={msg} />
      <SCard
        title="Workspace members"
        subtitle={`${members.length} active ${seatLimit ? `of ${seatLimit} seats` : "members"}`}
      >
        <div className="space-y-2">
          {members.length ? (
            members.map((m: any) => {
              const isOwner = m.role === "owner";
              return (
                <div
                  key={m.id}
                  className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 md:grid-cols-[minmax(0,1fr)_180px_120px] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="font-display text-[13px] font-semibold text-slate-900">{m.full_name || m.email || "User"}</div>
                    <div className="truncate font-body text-[12px] text-slate-500">{m.email || m.user_id}</div>
                  </div>
                  <SSelect
                    value={m.role}
                    disabled={!isAdmin || isOwner}
                    onChange={async (e) => {
                      setErr(null);
                      setMsg(null);
                      const result = await onUpdateRole?.(m.id, e.target.value);
                      if (result?.error) setErr(result.error);
                      else setMsg("Role updated");
                    }}
                  >
                    {isOwner ? <option value="owner">Owner</option> : null}
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </SSelect>
                  <BtnDanger
                    disabled={!isAdmin || isOwner}
                    onClick={async () => {
                      setErr(null);
                      setMsg(null);
                      const result = await onRevoke?.(m.id);
                      if (result?.error) setErr(result.error);
                      else setMsg("Member removed");
                    }}
                  >
                    <Trash2 size={13} />
                    Remove
                  </BtnDanger>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 font-body text-[13px] text-slate-500">
              No members found.
            </div>
          )}
        </div>
      </SCard>

      <SCard title="Invite user">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
          <SInput value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@company.com" />
          <SSelect value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </SSelect>
          <BtnPrimary
            disabled={!isAdmin}
            onClick={async () => {
              setErr(null);
              setMsg(null);
              const result = await onInvite?.(inviteEmail, inviteRole);
              if (result?.error) {
                setErr(result.error);
              } else {
                setMsg("Invite sent");
                setInviteEmail("");
                setInviteRole("member");
              }
            }}
          >
            <Plus size={14} />
            Invite
          </BtnPrimary>
        </div>

        <div className="mt-4 space-y-2">
          {invites.length ? (
            invites.map((invite: any) => (
              <div key={invite.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                <div>
                  <div className="font-display text-[13px] font-semibold text-slate-900">{invite.email}</div>
                  <div className="font-body text-[12px] text-slate-500">{invite.role} · pending</div>
                </div>
                <BtnDanger
                  disabled={!isAdmin}
                  onClick={async () => {
                    setErr(null);
                    setMsg(null);
                    const result = await onRevokeInvite?.(invite.id);
                    if (result?.error) setErr(result.error);
                    else setMsg("Invite revoked");
                  }}
                >
                  Revoke
                </BtnDanger>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-3.5 font-body text-[13px] text-slate-500">
              No pending invites.
            </div>
          )}
        </div>
      </SCard>
    </div>
  );
}

export function BillingPlansSection({ subscription, plans, isAdmin }: any) {
  return (
    <SectionShell title="Billing & Plans" description="Review your current plan, status, and available upgrades.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Current plan</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {isAdmin ? "Admin" : (subscription?.plan_code || "Free Trial")}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Plan status</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {isAdmin ? "Unlimited" : (subscription?.status || "Trial")}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Seats</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {isAdmin ? "Unlimited" : (subscription?.seat_limit || "—")}
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {(plans || []).map((plan: any) => (
            <div key={plan.plan_code} className="rounded-2xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-900">{plan.display_name || plan.plan_code}</div>
              <div className="mt-1 text-sm text-slate-500">${plan.price_monthly ?? 0}/mo</div>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

// Phase F — small inline helper used by the weak-save sections below so
// they no longer silently claim success on a failed write. The real-write
// handler (`onSavePreferences` in SettingsPage.tsx) throws on Supabase
// error via `requireNoError`, so the try/catch here surfaces real state.
function useSaveStatus() {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(
    null,
  );
  return { saving, status, setSaving, setStatus };
}

function SaveStatusPill({
  status,
}: {
  status: { kind: "ok" | "error"; message: string } | null;
}) {
  if (!status) return null;
  const cls =
    status.kind === "ok"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border border-rose-200 bg-rose-50 text-rose-700";
  const Icon = status.kind === "ok" ? CheckCircle2 : AlertCircle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {status.message}
    </span>
  );
}

export function RfpPipelineSection({ preferences, onSavePreferences }: any) {
  const [state, setState] = useState(preferences || {});
  const { saving, status, setSaving, setStatus } = useSaveStatus();

  useEffect(() => {
    setState(preferences || {});
  }, [preferences]);

  async function handleSave() {
    if (!onSavePreferences) return;
    setSaving(true);
    setStatus(null);
    try {
      await onSavePreferences(state);
      setStatus({ kind: "ok", message: "RFP settings saved" });
    } catch (err: any) {
      setStatus({
        kind: "error",
        message: err?.message || "Could not save RFP settings. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionShell title="RFP & Pipeline" description="Configure pipeline defaults for RFP workflows.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <Field label="Default pipeline owner">
          <Input
            value={state.owner || ""}
            onChange={(e) => setState((p: any) => ({ ...p, owner: e.target.value }))}
          />
        </Field>
        {/* Phase F — stage editor, response-window, auto-assign, lane-benchmark
            and currency controls aren't yet persisted (no `pipeline_stages`
            table; `organizations` is missing the relevant columns). We'd
            rather say so than render disabled stubs that suggest the feature
            ships today. */}
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-500">
          Pipeline stage editor, default response window, auto-assign, lane benchmark
          source, and currency are tracked as a Phase-F-backend ticket. Defaults apply
          until the database layer lands.
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <SaveStatusPill status={status} />
          <ActionButton onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save RFP settings"}
          </ActionButton>
        </div>
      </div>
    </SectionShell>
  );
}

export function CampaignPreferencesSection({ preferences, onSavePreferences }: any) {
  const [state, setState] = useState(preferences || {});
  const { saving, status, setSaving, setStatus } = useSaveStatus();

  useEffect(() => {
    setState(preferences || {});
  }, [preferences]);

  async function handleSave() {
    if (!onSavePreferences) return;
    setSaving(true);
    setStatus(null);
    try {
      await onSavePreferences(state);
      setStatus({ kind: "ok", message: "Campaign settings saved" });
    } catch (err: any) {
      setStatus({
        kind: "error",
        message: err?.message || "Could not save campaign settings. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionShell title="Campaign Preferences" description="Choose defaults for outbound campaign behavior.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <Field label="Default campaign sender">
          <Input
            value={state.sender || ""}
            onChange={(e) => setState((p: any) => ({ ...p, sender: e.target.value }))}
          />
        </Field>
        {/* Phase F — A/B test, stop-on-reply, stop-on-meeting, track opens,
            track clicks, default steps, and gap-between-steps defaults are
            not yet persisted. Shown as honest "coming soon" text rather than
            disabled toggles to avoid implying they're toggleable today. */}
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-500">
          Default sequence length, gap days, A/B subject-line tests, stop-on-reply /
          stop-on-meeting, and open/click tracking toggles are tracked as a Phase-F-backend
          ticket. Defaults apply until the database layer lands.
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <SaveStatusPill status={status} />
          <ActionButton onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save campaign settings"}
          </ActionButton>
        </div>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase F — Alerts & Notifications: 8 events × 3 channels (Email / In-app /
// Slack) = 24 toggles. Persisted as nested JSON at
// `user_preferences.preferences.alerts_notifications.matrix`. No new table,
// no migration — matches your "store in existing JSONB" decision.
// Save handler surfaces real success/error (`status` state below) so the UI
// no longer silently claims success on a failed write.
// ─────────────────────────────────────────────────────────────────────────────
const NOTIFICATION_EVENTS: Array<{ id: string; label: string; description: string }> = [
  {
    id: "reply_received",
    label: "Reply received",
    description: "A prospect replies to a campaign email.",
  },
  {
    id: "meeting_booked",
    label: "Meeting booked",
    description: "A prospect books a slot on your calendar.",
  },
  {
    id: "deal_stage_changed",
    label: "Deal stage changed",
    description: "Someone moves a deal in Command Center.",
  },
  {
    id: "campaign_finished",
    label: "Campaign finished",
    description: "All prospects in a sequence have completed.",
  },
  {
    id: "rfp_due_soon",
    label: "RFP due within 48h",
    description: "Deal Builder items approaching deadline.",
  },
  {
    id: "weekly_digest",
    label: "Weekly pipeline digest",
    description: "Monday morning summary.",
  },
  {
    id: "billing_alerts",
    label: "Billing alerts",
    description: "Invoice failures, credit exhaustion.",
  },
  {
    id: "security_events",
    label: "Security events",
    description: "New device login, password changes.",
  },
];

type NotificationChannel = "email" | "in_app" | "slack";
type NotificationMatrix = Record<string, Record<NotificationChannel, boolean>>;

function defaultNotificationMatrix(): NotificationMatrix {
  const m: NotificationMatrix = {};
  for (const ev of NOTIFICATION_EVENTS) {
    m[ev.id] = { email: true, in_app: true, slack: false };
  }
  return m;
}

function readNotificationMatrix(preferences: any): NotificationMatrix {
  const fromPrefs = preferences?.matrix;
  if (!fromPrefs || typeof fromPrefs !== "object") return defaultNotificationMatrix();
  const defaults = defaultNotificationMatrix();
  const merged: NotificationMatrix = {};
  for (const ev of NOTIFICATION_EVENTS) {
    const stored = fromPrefs[ev.id] || {};
    merged[ev.id] = {
      email: stored.email ?? defaults[ev.id].email,
      in_app: stored.in_app ?? defaults[ev.id].in_app,
      slack: stored.slack ?? defaults[ev.id].slack,
    };
  }
  return merged;
}

export function AlertsNotificationsSection({ preferences, onSavePreferences }: any) {
  const [matrix, setMatrix] = useState<NotificationMatrix>(() =>
    readNotificationMatrix(preferences),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    setMatrix(readNotificationMatrix(preferences));
  }, [preferences]);

  function toggle(eventId: string, channel: NotificationChannel) {
    setMatrix((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        [channel]: !prev[eventId][channel],
      },
    }));
    setStatus(null);
  }

  async function handleSave() {
    if (!onSavePreferences) return;
    setSaving(true);
    setStatus(null);
    try {
      await onSavePreferences({ matrix });
      setStatus({ kind: "ok", message: "Notification preferences saved" });
    } catch (err: any) {
      setStatus({
        kind: "error",
        message: err?.message || "Could not save preferences. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const channelMeta: Array<{ id: NotificationChannel; label: string }> = [
    { id: "email", label: "Email" },
    { id: "in_app", label: "In-app" },
    { id: "slack", label: "Slack" },
  ];

  return (
    <SectionShell
      title="Alerts & Notifications"
      description="Route the signals you care about to email, in-app, or Slack. Everything else stays quiet."
    >
      <SCard>
        {/* Header row */}
        <div className="hidden grid-cols-[minmax(0,1fr)_repeat(3,80px)] gap-2 border-b border-slate-100 pb-3 mb-1 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 md:grid">
          <span>Event</span>
          {channelMeta.map((c) => (
            <span key={c.id} className="text-center">
              {c.label}
            </span>
          ))}
        </div>

        <div className="divide-y divide-slate-100">
          {NOTIFICATION_EVENTS.map((ev) => (
            <div
              key={ev.id}
              className="grid grid-cols-[minmax(0,1fr)_repeat(3,56px)] items-center gap-2 py-3 md:grid-cols-[minmax(0,1fr)_repeat(3,80px)]"
            >
              <div className="min-w-0">
                <div className="font-display text-[13px] font-semibold text-slate-900">{ev.label}</div>
                <div className="mt-0.5 truncate font-body text-[12px] text-slate-500">{ev.description}</div>
              </div>
              {channelMeta.map((c) => {
                const on = matrix[ev.id]?.[c.id] ?? false;
                return (
                  <div key={c.id} className="flex items-center justify-center">
                    <RawToggle
                      on={on}
                      onToggle={() => toggle(ev.id, c.id)}
                      label={`${ev.label} — ${c.label}`}
                      small
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-1">
          {status ? (
            <Pill tone={status.kind === "ok" ? "green" : "red"} icon={
              status.kind === "ok" ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />
            }>
              {status.message}
            </Pill>
          ) : null}
          <BtnPrimary onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save notification settings"}
          </BtnPrimary>
        </div>
      </SCard>
    </SectionShell>
  );
}

export function SecurityApiSection({ apiKeys = [], auditLog = [], onGenerateKey, onRevokeKey }: any) {
  const [keyName, setKeyName] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);

  return (
    <SectionShell title="Security & API" description="Manage API keys and review recent security events.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="New key name" />
          <ActionButton
            onClick={async () => {
              const value = await onGenerateKey?.(keyName);
              if (value) {
                setGenerated(value);
                setKeyName("");
              }
            }}
          >
            <Plus size={16} />
            Generate key
          </ActionButton>
        </div>
        {generated ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Copy this key now. It will only be shown once:
            <div className="mt-2 break-all rounded-xl bg-white p-3 font-mono text-xs text-slate-800">{generated}</div>
          </div>
        ) : null}
        <div className="mt-5 space-y-3">
          {apiKeys.map((key: any) => (
            <div key={key.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
              <div>
                <div className="font-medium text-slate-900">{key.key_name}</div>
                <div className="text-sm text-slate-500">{key.key_prefix}••••</div>
              </div>
              <ActionButton variant="danger" onClick={() => onRevokeKey?.(key.id)}>
                Revoke
              </ActionButton>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-4 font-semibold text-slate-900">Recent audit events</div>
        <div className="space-y-3">
          {auditLog.map((event: any) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="font-medium text-slate-900">{event.action}</div>
              <div className="text-sm text-slate-500">{event.created_at}</div>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

export function WorkspaceCreditsSection({ tokenUsage = [], subscription, isAdmin }: any) {
  return (
    <SectionShell title="Workspace Credits" description="View token and credit usage across workspace features.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-4 text-sm text-slate-500">
          {isAdmin ? "Unlimited credits for admin workspace" : `Plan: ${subscription?.plan_code || "trial"}`}
        </div>
        <div className="space-y-3">
          {tokenUsage.length ? (
            tokenUsage.map((item: any, idx: number) => (
              <div key={`${item.feature}-${idx}`} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                <div className="font-medium text-slate-900">{item.feature}</div>
                <div className="text-sm text-slate-600">{item.tokens_used}</div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No usage data yet.
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}

export function TeamSubscriptionsSection({ members = [], subscription, isAdmin }: any) {
  return (
    <SectionShell title="Team Subscriptions" description="Review seat usage and workspace subscription visibility.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Members</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{members.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Seat limit</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {isAdmin ? "Unlimited" : (subscription?.seat_limit || "—")}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Subscription</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {isAdmin ? "Admin" : (subscription?.status || "Trial")}
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase F — Integrations section.
// Gmail / Outlook tiles are real (disconnect is wired via onDisconnect).
// PhantomBuster / Apollo / ImportYeti / logo.dev tiles render an honest
// "Managed centrally" disabled state because the `integrations.integration_type`
// CHECK constraint in Supabase only currently allows Gmail / Outlook / Slack /
// Salesforce / Zapier — persisting the other providers requires a backend
// schema change (tracked as a Phase-F-backend ticket). We never fake a
// connection.
// ─────────────────────────────────────────────────────────────────────────────
const INTEGRATION_CATALOG = [
  {
    id: "gmail",
    name: "Gmail",
    category: "Inbox / Sending",
    icon: Mail,
    status: "wired",
    description: "Send outbound directly from your Gmail account.",
  },
  {
    id: "outlook",
    name: "Outlook",
    category: "Inbox / Sending",
    icon: Mail,
    status: "wired",
    description: "Send outbound directly from Microsoft 365 / Outlook.",
  },
  {
    id: "linkedin",
    name: "LinkedIn (via PhantomBuster)",
    category: "Social engagement",
    icon: Linkedin,
    status: "managed_centrally",
    description: "Sync connection requests, InMail sends, and reply signals.",
  },
  {
    id: "apollo",
    name: "Apollo",
    category: "Contact enrichment",
    icon: Users,
    status: "managed_centrally",
    description: "Resolve shipper decision-makers surfaced in Discover.",
  },
  {
    id: "importyeti",
    name: "ImportYeti",
    category: "Shipment intelligence",
    icon: FileText,
    status: "managed_centrally",
    description: "Sourced automatically behind the scenes — no action required.",
  },
  {
    id: "logo_dev",
    name: "logo.dev",
    category: "Company branding",
    icon: Building2,
    status: "managed_centrally",
    description: "Auto-resolves company logos across the app.",
  },
] as const;

export function IntegrationsSection({
  integrations,
  onDisconnect,
}: {
  integrations?: Array<{
    id?: string;
    integration_type?: string;
    type?: string;
    status?: string;
    external_id?: string;
  }>;
  onDisconnect?: (id: string) => Promise<void> | void;
}) {
  const wired = Array.isArray(integrations) ? integrations : [];
  const connectedByType = new Map<string, { id?: string; external_id?: string }>();
  for (const row of wired) {
    const key = String(row?.integration_type || row?.type || "").toLowerCase();
    if (!key) continue;
    connectedByType.set(key, { id: row?.id, external_id: row?.external_id });
  }

  return (
    <SectionShell
      title="Integrations"
      description="Connect inboxes and enrichment providers. Inbox connections power the Outbound Engine."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {INTEGRATION_CATALOG.map((entry) => {
          const Icon = entry.icon;
          const managed = entry.status === "managed_centrally";
          const connection = connectedByType.get(entry.id);
          const isConnected = !managed && Boolean(connection);
          return (
            <div
              key={entry.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
                    <Icon className="h-4 w-4 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{entry.name}</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {entry.category}
                    </div>
                  </div>
                </div>
                {managed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    <Lock className="h-3 w-3" />
                    Managed centrally
                  </span>
                ) : isConnected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    Not connected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{entry.description}</p>
              {managed ? (
                <div className="text-[11px] text-slate-400">
                  This provider is configured by your workspace administrator. No action
                  needed from you.
                </div>
              ) : isConnected ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-xs text-slate-600">
                    {connection?.external_id || "Active"}
                  </div>
                  {onDisconnect && connection?.id ? (
                    <button
                      type="button"
                      onClick={() => onDisconnect(connection.id as string)}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Disconnect
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">
                  Connect {entry.name} from the Outbound Engine onboarding flow when you
                  launch a campaign.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase F — Outreach Accounts section.
// Email-signature write is real (persists to user_preferences). Daily cap /
// quiet hours / inbox warmup / SPF-DKIM panel render honest "Not yet
// configured" tiles — no backend writer / read surface exists. Tracked as a
// Phase-F-backend ticket.
// ─────────────────────────────────────────────────────────────────────────────
export function OutreachAccountsSection({
  emailSignature,
  onSaveSignature,
}: {
  emailSignature?: string;
  onSaveSignature?: (signature: string) => Promise<void> | void;
}) {
  const [signature, setSignature] = useState(emailSignature || "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    setSignature(emailSignature || "");
  }, [emailSignature]);

  async function handleSaveSignature() {
    if (!onSaveSignature) return;
    setSaving(true);
    setStatus(null);
    try {
      await onSaveSignature(signature);
      setStatus({ kind: "ok", message: "Signature saved" });
    } catch (err: any) {
      setStatus({
        kind: "error",
        message: err?.message || "Could not save signature. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionShell
      title="Outreach Accounts"
      description="Sender identity, signature, and deliverability controls for the Outbound Engine."
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Send className="h-4 w-4 text-slate-500" />
            <div className="text-sm font-semibold text-slate-900">Outbound signature</div>
          </div>
          <Field label="Signature">
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              rows={5}
              placeholder="Jordan Davis&#10;VP of Sales · Logistic Intel&#10;jordan@logisticintel.com"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </Field>
          <p className="mt-1 text-xs text-slate-400">
            Appended to every campaign send. Merge tags supported by the Outbound Engine.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveSignature}
              disabled={saving || !onSaveSignature}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save signature"}
            </button>
            {status ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold ${
                  status.kind === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {status.kind === "ok" ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {status.message}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-slate-400" />
            <div className="text-sm font-semibold text-slate-700">
              Deliverability controls
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Daily send cap, quiet hours, inbox warmup, SPF/DKIM verification, and tracking
            domain are not yet configurable from Settings. We never apply unsafe defaults
            silently — contact your workspace admin or wait for the upcoming release.
          </p>
        </div>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase F — Affiliate Program section.
// No `affiliate_links`, `affiliate_earnings`, or `referred_workspaces` tables
// exist. Rendering a referral URL / earnings / workspace list without those
// tables would be mock data. Ships as honest empty state + "Request access"
// CTA that mails support.
// ─────────────────────────────────────────────────────────────────────────────
export function AffiliateProgramSection() {
  return (
    <SectionShell
      title="Affiliate Program"
      description="Referrals, earnings, and affiliate payouts for your workspace."
    >
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200">
          <Gift className="h-4 w-4 text-slate-500" />
        </div>
        <div className="text-sm font-semibold text-slate-900">
          Program not yet enabled for your workspace
        </div>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          We&rsquo;re rolling out affiliate payouts and workspace referral tracking in a
          future release. Real referral links, earnings, and referred-workspace status
          will appear here once the program ships — we won&rsquo;t show any numbers until
          they&rsquo;re real.
        </p>
        <a
          href="mailto:support@logisticintel.com?subject=Affiliate%20Program%20access"
          className="mt-4 inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          Request access
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Accounts — user-facing inbox connection surface.
// Gmail: real OAuth via oauth-gmail-start edge function.
// Outlook: setup-required (no backend deployed).
// Reads from lit_email_accounts (no tokens ever in browser).
// ─────────────────────────────────────────────────────────────────────────────

type GmailCardState =
  | "loading"
  | "connected"
  | "not_connected"
  | "setup_required"
  | "error";

function StatusBadge({
  state,
}: {
  state: "connected" | "not_connected" | "setup_required" | "error" | "loading";
}) {
  if (state === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Connected
      </span>
    );
  }
  if (state === "setup_required") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Setup required
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        Error
      </span>
    );
  }
  if (state === "loading") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" />
        Checking…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      Not connected
    </span>
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
  const [connecting, setConnecting] = useState(false);
  const [localSetupRequired, setLocalSetupRequired] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const gmailAccount = accounts.find(
    (a) => a.provider === "gmail" && a.status === "connected",
  );

  let cardState: GmailCardState = "not_connected";
  if (loadingAccounts) cardState = "loading";
  else if (localSetupRequired) cardState = "setup_required";
  else if (gmailAccount) cardState = "connected";

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    setLocalSetupRequired(false);
    const result = await startGmailOAuth();
    setConnecting(false);
    if ("url" in result) {
      window.location.href = result.url;
      return;
    }
    if ("setupRequired" in result) {
      setLocalSetupRequired(true);
      return;
    }
    if ("configError" in result) {
      setConnectError("Integration service unavailable. Check Supabase configuration.");
      return;
    }
    setConnectError(result.error);
  }

  const lastUpdated = gmailAccount?.updated_at
    ? new Date(gmailAccount.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const connected = cardState === "connected";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-[18px] flex flex-col gap-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
          <Mail className="w-[18px] h-[18px] text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-display text-[14px] font-bold text-slate-900">Gmail</div>
            <Pill tone="blue">Required for sending</Pill>
          </div>
          <div className="font-body text-[11px] uppercase tracking-[0.05em] font-semibold text-slate-400 mt-0.5">Inbox / Sending</div>
        </div>
        <Pill tone={connected ? "green" : cardState === "loading" ? "slate" : "slate"} dot>
          {connected ? "Connected" : cardState === "loading" ? "Checking…" : "Not connected"}
        </Pill>
      </div>

      {/* Description */}
      <p className="font-body text-[12.5px] text-slate-600 leading-[1.55]">
        Connect Gmail to send campaign emails from your own inbox. LIT will
        never expose OAuth tokens in the browser.
      </p>

      {/* Connected account chip */}
      {connected && gmailAccount ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <div className="font-mono text-[12px] font-semibold text-slate-900 truncate flex-1">
            {gmailAccount.email}
          </div>
          {lastUpdated ? (
            <span className="font-body text-[11px] text-slate-400 shrink-0">Updated {lastUpdated}</span>
          ) : null}
        </div>
      ) : null}

      {/* Setup required notice */}
      {cardState === "setup_required" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 font-body text-[12px] text-amber-800">
          Gmail connection function is not deployed yet.
        </div>
      ) : null}

      {/* Error notice */}
      {connectError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 font-body text-[12px] text-rose-700">
          {connectError}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        {connected ? (
          <>
            <BtnGhost
              type="button"
              className="flex-1 justify-center"
              onClick={handleConnect}
              disabled={connecting || loadingAccounts}
            >
              {connecting ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Reconnecting…</> : "Reconnect"}
            </BtnGhost>
            <BtnDanger type="button" className="flex-1 justify-center" disabled>
              Disconnect · setup required
            </BtnDanger>
          </>
        ) : cardState !== "setup_required" ? (
          <BtnPrimary
            type="button"
            className="flex-1 justify-center"
            onClick={handleConnect}
            disabled={connecting || loadingAccounts}
          >
            {connecting ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Connecting…</>
            ) : (
              <><Mail className="h-3.5 w-3.5" />Connect Gmail</>
            )}
          </BtnPrimary>
        ) : (
          <BtnGhost type="button" className="flex-1 justify-center" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            Refresh status
          </BtnGhost>
        )}
        {!connected && cardState !== "setup_required" ? (
          <BtnGhost type="button" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
          </BtnGhost>
        ) : null}
      </div>
    </div>
  );
}

function OutlookCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-[18px] flex flex-col gap-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
          <Mail className="w-[18px] h-[18px] text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[14px] font-bold text-slate-900">Microsoft / Outlook</div>
          <div className="font-body text-[11px] uppercase tracking-[0.05em] font-semibold text-slate-400 mt-0.5">Inbox / Sending</div>
        </div>
        <Pill tone="slate" dot>Not connected</Pill>
      </div>

      {/* Description */}
      <p className="font-body text-[12.5px] text-slate-600 leading-[1.55]">
        Connect Microsoft 365 Outlook to send campaign emails from your
        company mailbox. Recommended for freight forwarders and enterprise teams.
      </p>

      {/* Setup required notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 font-body text-[12px] text-amber-800">
        Outlook backend connection function is not deployed yet.
      </div>

      {/* Action */}
      <div className="flex gap-2 mt-auto">
        <button
          type="button"
          disabled
          title="Outlook backend connection function is not deployed yet."
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 font-display text-[13px] font-semibold text-slate-400 cursor-not-allowed opacity-60"
        >
          <Lock className="h-3.5 w-3.5" />
          Connect Outlook · setup required
        </button>
      </div>
    </div>
  );
}

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
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="font-body text-[13px] text-slate-500">
          We can&rsquo;t read your mailbox status right now. Try refreshing the
          page or contact support if this persists.
        </p>
      </div>
    );
  }

  const hasMailbox = accounts.length > 0;
  const hasPrimary = Boolean(primaryEmail);
  const connectedAccount = accounts.find((a) => a.status === "connected");

  const rows: Array<{ label: string; value: string; ok: boolean | null }> = [
    {
      label: "Mailbox in lit_email_accounts",
      value: loading ? "Checking…" : hasMailbox ? "Yes" : "No",
      ok: loading ? null : hasMailbox,
    },
    {
      label: "Primary mailbox set",
      value: loading ? "Checking…" : hasPrimary ? "Yes" : "No",
      ok: loading ? null : hasPrimary,
    },
    {
      label: "Test send available",
      value: "Setup required",
      ok: false,
    },
    {
      label: "Campaign dispatch available",
      value: hasPrimary ? "Ready" : "Setup required",
      ok: loading ? null : hasPrimary,
    },
  ];

  return (
    <SCard
      title="Email sending readiness"
      subtitle="Derived from your connected mailboxes and workspace settings."
    >
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="flex items-center gap-2">
              <span className={[
                "w-2 h-2 rounded-full shrink-0",
                row.ok === true
                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                  : row.ok === false
                  ? "bg-slate-300"
                  : "bg-slate-200",
              ].join(" ")} />
              <span className="font-display text-[11.5px] font-semibold text-slate-700">{row.label}</span>
            </div>
            <Pill
              tone={row.ok === true ? "green" : row.ok === false ? "amber" : "slate"}
              icon={row.ok === true ? <CheckCircle2 size={10} /> : row.ok === false ? <AlertCircle size={10} /> : undefined}
            >
              {row.value}
            </Pill>
          </li>
        ))}
      </ul>
      {connectedAccount ? (
        <div className="border-t border-slate-100 pt-4 mt-2">
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">
            Campaign sending settings
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="font-display text-[12px] font-semibold text-slate-700">
                Default sending account
              </div>
              <div className="mt-0.5 font-body text-[12px] text-slate-500">
                {primaryEmail ?? connectedAccount.email}
                {!primaryEmail && (
                  <span className="ml-1 text-amber-600">(Setup required)</span>
                )}
              </div>
            </div>
            <div>
              <div className="font-display text-[12px] font-semibold text-slate-700">
                Daily send limit
              </div>
              <div className="mt-0.5 font-body text-[12px] text-slate-500">
                {(connectedAccount as any).daily_send_limit
                  ? String((connectedAccount as any).daily_send_limit)
                  : "Defaults apply"}
              </div>
            </div>
            <div>
              <div className="font-display text-[12px] font-semibold text-slate-700">
                Signature
              </div>
              <div className="mt-0.5 font-body text-[12px] text-slate-500">
                <a
                  href="/app/settings?tab=preferences"
                  className="text-blue-600 hover:underline"
                >
                  Edit in Preferences
                </a>
              </div>
            </div>
            <div>
              <div className="font-display text-[12px] font-semibold text-slate-700">
                Reply tracking
              </div>
              <div className="mt-0.5 font-body text-[12px] text-slate-500">Not configured</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 font-body text-[11px] text-slate-500">
            <span className="font-display font-semibold text-slate-700">Test send</span> ·
            Setup required — <code className="font-mono">send-test-email</code>{" "}
            function is not deployed yet.
          </div>
        </div>
      ) : null}
    </SCard>
  );
}

export function EmailAccountsSection({
  integrations,
  onDisconnect,
}: {
  integrations?: Array<{
    id?: string;
    integration_type?: string;
    type?: string;
    status?: string;
    external_id?: string;
  }>;
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
    } catch {
      // RLS block or table missing — show honest empty state
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    void refreshAccounts();
  }, []);

  const handleRefresh = async () => {
    await Promise.all([refreshAccounts(), refreshInbox()]);
  };

  return (
    <SectionShell
      title="Email Accounts"
      description="Connect Gmail or Outlook so the Outbound Engine can send on your behalf."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <GmailCard
          accounts={accounts}
          loadingAccounts={loadingAccounts}
          onRefresh={handleRefresh}
        />
        <OutlookCard />
      </div>

      <EmailReadinessPanel
        accounts={accounts}
        loading={loadingAccounts || inboxLoading}
        known={known}
        primaryEmail={primaryEmail}
      />
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Team — plan-gated wrapper around the existing AccessRolesSection.
//   - Free Trial / Free / Starter: upgrade-required card. No invite UI
//     rendered, so a misconfigured org_invites insert can't even reach
//     the network from this surface.
//   - Growth / Enterprise: full AccessRolesSection (members list,
//     invite, revoke, change role) — backed by the real org_invites
//     table + send-org-invite edge function that already exist.
// ─────────────────────────────────────────────────────────────────────────────

// Single source of truth: planLimits.PLAN_LIMITS[plan].features.seat_management.
// normalizePlanCode handles aliases (free/standard/pro/unlimited) + the
// canonical free_trial/starter/growth/enterprise codes the DB seeds use.
function isInviteAllowedPlan(plan?: string | null): boolean {
  return PLAN_LIMITS[normalizePlanCode(plan)].features.seat_management === true;
}

function planLabel(plan?: string | null): string {
  return PLAN_LIMITS[normalizePlanCode(plan)].label;
}

function TeamUpgradeCard({
  plan,
  onUpgrade,
}: {
  plan?: string | null;
  onUpgrade?: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
          <Lock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
            Upgrade required
          </p>
          <h3 className="mt-1 font-display text-[15px] font-bold text-slate-900">
            Team invites are on Growth and above
          </h3>
          <p className="mt-1 font-body text-[13px] text-slate-600 leading-relaxed">
            Your current plan is <span className="font-semibold text-slate-900">{planLabel(plan)}</span>.
            Upgrade to Growth or Enterprise to invite teammates, manage
            roles, and share saved companies and campaigns.
          </p>
          <BtnPrimary
            type="button"
            onClick={onUpgrade}
            className="mt-4"
          >
            View plans
          </BtnPrimary>
        </div>
      </div>
    </div>
  );
}

export function TeamSection(props: {
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
  inviteBackendAvailable?: boolean;
}) {
  const allowed = isInviteAllowedPlan(props.plan);

  if (!allowed) {
    return (
      <SectionShell
        title="Team"
        description="Invite teammates and assign roles for shared campaigns and saved companies."
      >
        <TeamUpgradeCard plan={props.plan} onUpgrade={props.onUpgrade} />
      </SectionShell>
    );
  }

  const backendDown = props.inviteBackendAvailable === false;
  if (backendDown) {
    return (
      <SectionShell
        title="Team"
        description="Invite teammates and assign roles for shared campaigns and saved companies."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 ring-1 ring-slate-200">
              <Lock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                Team invites unavailable
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Team invites require the invite endpoint to be enabled. Contact
                support if your workspace should have access.
              </p>
            </div>
          </div>
        </div>
      </SectionShell>
    );
  }

  // Real invite flow — defers to the existing AccessRolesSection wired
  // to org_invites + send-org-invite. The wrapper just adds a small
  // header card with current plan + seat capacity context.
  return (
    <SectionShell
      title="Team"
      description="Invite teammates and assign roles for shared campaigns and saved companies."
    >
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-600">
              Plan · Team
            </p>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{planLabel(props.plan)}</span>
              {props.seatLimit ? (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  Up to {props.seatLimit} seat{props.seatLimit === 1 ? "" : "s"}
                </>
              ) : null}
              <span className="mx-2 text-slate-300">·</span>
              {(props.members?.length ?? 0)} active
              {props.invites?.length
                ? ` · ${props.invites.length} pending`
                : ""}
            </p>
          </div>
        </div>
      </div>

      <AccessRolesSection
        members={props.members}
        invites={props.invites}
        seatLimit={props.seatLimit}
        onInvite={props.onInvite}
        onRevoke={props.onRevoke}
        onUpdateRole={props.onUpdateRole}
        onRevokeInvite={props.onRevokeInvite}
        isAdmin={props.isAdmin}
      />
    </SectionShell>
  );
}

// ── Workspace ───────────────────────────────────────────────────────────
// Org info card + the existing real TeamSection (members / invites / roles).
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
  const seatLine = props.seatLimit
    ? `${props.members?.length ?? 0} of ${props.seatLimit} seats used`
    : `${props.members?.length ?? 0} active members`;

  return (
    <SectionShell
      title="Workspace"
      description="Your shared organization, role, and team membership."
    >
      <SCard>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 font-display text-[18px] font-bold text-white shadow-sm">
            {(props.workspaceName?.[0] || "L").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-bold text-slate-900">
              {props.workspaceName || "Logistic Intel workspace"}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {props.workspaceRole ? (
                <Pill tone="blue">{props.workspaceRole}</Pill>
              ) : null}
              {props.joinedLabel ? (
                <Pill tone="slate">Joined {props.joinedLabel}</Pill>
              ) : null}
              <Pill tone="slate">{seatLine}</Pill>
            </div>
          </div>
        </div>
      </SCard>

      <TeamSection
        plan={props.plan}
        members={props.members}
        invites={props.invites}
        seatLimit={props.seatLimit}
        onInvite={props.onInvite}
        onRevoke={props.onRevoke}
        onUpdateRole={props.onUpdateRole}
        onRevokeInvite={props.onRevokeInvite}
        isAdmin={props.isAdmin}
        onUpgrade={props.onUpgrade}
      />
    </SectionShell>
  );
}

// ── Security ────────────────────────────────────────────────────────────
// Slim, user-facing version: password reset CTA, sign-in method indicator,
// recent audit events. API-key management stays on the admin route.
export function SecuritySection(props: {
  email?: string | null;
  authProvider?: string | null;
  auditLog?: Array<{ id: string; action: string; ip_address?: string; created_at: string }>;
}) {
  const provider = (props.authProvider || "email").toLowerCase();
  const providerLabel =
    provider === "google" ? "Google" :
    provider === "azure" || provider === "microsoft" ? "Microsoft" :
    "Email + password";

  return (
    <SectionShell
      title="Security"
      description="Password and recent activity on your Logistic Intel account."
    >
      <SCard title="Sign-in method">
        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div>
            <div className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Provider
            </div>
            <div className="mt-1 font-display text-[13px] font-semibold text-slate-900">
              {providerLabel}
            </div>
          </div>
          <div>
            <div className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Email
            </div>
            <div className="mt-1 break-all font-body text-[13px] text-slate-900">
              {props.email || "—"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/reset-password"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 font-display text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <KeyRound size={13} />
            Change password
          </a>
        </div>
      </SCard>

      <SCard
        title="Recent activity"
        right={
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            Last {Math.min(20, props.auditLog?.length ?? 0)} events
          </span>
        }
      >
        {(!props.auditLog || props.auditLog.length === 0) ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center font-body text-[13px] text-slate-500">
            No recent activity yet. Sign-ins and security events will appear here.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {props.auditLog.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="font-display text-[13px] font-semibold text-slate-900">{event.action}</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {event.ip_address ? `${event.ip_address} · ` : ""}
                    {new Date(event.created_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SCard>
    </SectionShell>
  );
}

// ── Preferences (timezone + signature; explicit "coming soon" for future) ──
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
    setSavingTz(true);
    setTzMsg(null);
    const r = await props.onSaveTimezone(tz.trim());
    setSavingTz(false);
    setTzMsg(r && (r as any).error ? `Could not save: ${(r as any).error}` : "Saved.");
    setTimeout(() => setTzMsg(null), 2500);
  }

  async function saveSig() {
    if (!props.onSaveEmailSignature) return;
    setSavingSig(true);
    setSigMsg(null);
    const r = await props.onSaveEmailSignature(sig);
    setSavingSig(false);
    setSigMsg(r && (r as any).error ? `Could not save: ${(r as any).error}` : "Saved.");
    setTimeout(() => setSigMsg(null), 2500);
  }

  return (
    <SectionShell
      title="Preferences"
      description="Personal defaults for time, email signature, and search."
    >
      <SCard title="Timezone" subtitle="Display dates and reset times in this timezone.">
        <div className="space-y-3">
          <SField label="IANA timezone identifier">
            <SInput
              type="text"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="America/New_York"
            />
          </SField>
          <div className="flex items-center gap-3">
            <BtnPrimary
              type="button"
              onClick={saveTz}
              disabled={savingTz}
            >
              {savingTz ? "Saving…" : "Save timezone"}
            </BtnPrimary>
            {tzMsg ? <span className="font-body text-[12px] text-slate-500">{tzMsg}</span> : null}
          </div>
        </div>
      </SCard>

      <SCard title="Email signature" subtitle="Appended to every outbound campaign email.">
        <div className="space-y-3">
          <STextarea
            rows={4}
            value={sig}
            onChange={(e) => setSig(e.target.value)}
            placeholder={"— Jane Smith\nLogistic Intel\nyour-email@company.com"}
          />
          <div className="flex items-center gap-3">
            <BtnPrimary
              type="button"
              onClick={saveSig}
              disabled={savingSig}
            >
              {savingSig ? "Saving…" : "Save signature"}
            </BtnPrimary>
            {sigMsg ? <span className="font-body text-[12px] text-slate-500">{sigMsg}</span> : null}
          </div>
        </div>
      </SCard>

      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5">
        <div className="font-display text-[13px] font-bold text-slate-900 mb-1">Default search filters</div>
        <p className="font-body text-[12.5px] text-slate-500">
          Coming soon — pin lane, mode, or country filters so they apply by default whenever you open Search.
        </p>
      </div>
    </SectionShell>
  );
}

// ── Integrations (email + enrichment + affiliate payouts) ─────────────
// Wraps EmailAccountsSection (real Gmail OAuth + Outlook setup-required)
// and surfaces enrichment connections + a partner-aware Stripe Connect
// link if applicable.
export function IntegrationsHubSection(props: {
  integrations?: Array<{
    id?: string;
    integration_type?: string;
    type?: string;
    status?: string;
    external_id?: string;
  }>;
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
    <div className="space-y-6">
      {/* Gmail / Outlook cards + readiness panel */}
      <EmailAccountsSection
        integrations={props.integrations}
        onDisconnect={props.onDisconnect}
      />

      {/* Enrichment card */}
      <SCard
        title="Enrichment"
        subtitle="Apollo, Lusha, or Hunter contact enrichment providers."
        right={
          <Pill tone={enrichmentRows.length > 0 ? "green" : "slate"} dot>
            {enrichmentRows.length > 0 ? `${enrichmentRows.length} connected` : "Not connected"}
          </Pill>
        }
      >
        {enrichmentRows.length === 0 ? (
          <p className="font-body text-[12.5px] text-slate-500">
            Enrichment runs through your workspace admin&rsquo;s API keys today.
            User-level enrichment provider connections ship in a future release.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {enrichmentRows.map((row) => {
              const k = String(row?.integration_type || row?.type || "").toLowerCase();
              const label = k.charAt(0).toUpperCase() + k.slice(1);
              return (
                <li
                  key={row.id || k}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <div className="font-display text-[13px] font-semibold text-slate-900">{label}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {row.external_id || "Connected"}
                    </div>
                  </div>
                  {row.id ? (
                    <BtnGhost
                      type="button"
                      onClick={() => props.onDisconnect?.(row.id as string)}
                    >
                      <Trash2 size={12} />
                      Disconnect
                    </BtnGhost>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SCard>

      {/* Stripe Connect partner card — only if affiliate partner */}
      {props.isPartner ? (
        <SCard>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 ring-1 ring-blue-200">
              <Coins size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[14px] font-bold text-slate-900">
                Stripe Connect — partner payouts
              </div>
              <p className="mt-1 font-body text-[12.5px] text-slate-600">
                Manage your partner payout account and view connection status
                from the Affiliate dashboard.
              </p>
            </div>
            <a
              href="/app/affiliate"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-sm transition hover:from-blue-600 hover:to-blue-700"
            >
              Manage payouts
              <ExternalLink size={12} />
            </a>
          </div>
        </SCard>
      ) : null}
    </div>
  );
}
