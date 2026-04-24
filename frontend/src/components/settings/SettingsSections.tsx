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
} from "lucide-react";

// Phase F — 11-section nav approved by the user. Previous sections
// "Email", "LinkedIn", "Company & Signature", "Workspace Credits", and
// "Team Subscriptions" are folded:
//   - Email + LinkedIn    → Integrations
//   - email_signature     → Outreach Accounts
//   - Company & Signature → Organization (renamed)
//   - Billing & Plans     → Billing (renamed; Workspace Credits info
//                          surfaces on the canonical /app/billing page)
//   - Team Subscriptions  → Access & Roles (seat capacity rendered there)
export type SettingsSectionId =
  | "Profile"
  | "Security & API"
  | "Alerts & Notifications"
  | "Access & Roles"
  | "Integrations"
  | "Outreach Accounts"
  | "Campaign Preferences"
  | "RFP & Pipeline"
  | "Affiliate Program"
  | "Organization"
  | "Billing";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  title: string;
  icon: React.ComponentType<any>;
}> = [
  { id: "Profile", title: "Profile", icon: User },
  { id: "Security & API", title: "Security & API", icon: KeyRound },
  { id: "Alerts & Notifications", title: "Alerts & Notifications", icon: Bell },
  { id: "Access & Roles", title: "Access & Roles", icon: ShieldCheck },
  { id: "Integrations", title: "Integrations", icon: Plug },
  { id: "Outreach Accounts", title: "Outreach Accounts", icon: Send },
  { id: "Campaign Preferences", title: "Campaign Preferences", icon: Megaphone },
  { id: "RFP & Pipeline", title: "RFP & Pipeline", icon: FileText },
  { id: "Affiliate Program", title: "Affiliate Program", icon: Gift },
  { id: "Organization", title: "Organization", icon: Building2 },
  { id: "Billing", title: "Billing", icon: CreditCard },
];

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition",
        "focus:border-blue-400 focus:ring-4 focus:ring-blue-100",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition",
        "focus:border-blue-400 focus:ring-4 focus:ring-blue-100",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition",
        "focus:border-blue-400 focus:ring-4 focus:ring-blue-100",
        props.className || "",
      ].join(" ")}
    />
  );
}

function ActionButton({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const variants = {
    primary:
      "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:from-blue-700 hover:to-indigo-700",
    secondary:
      "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    danger:
      "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  };
  return (
    <button
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        props.className || "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function StatusMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      <CheckCircle2 size={16} />
      {success}
    </div>
  );
}

type ProfileSectionProps = {
  initialData?: {
    name?: string;
    email?: string;
    title?: string;
    phone?: string;
    location?: string;
    bio?: string;
    avatar_url?: string;
    savedCount?: number;
    campaignsCount?: number;
    rfpsCount?: number;
    plan?: string;
    isAdmin?: boolean;
  };
  onSave?: (data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onUploadAvatar?: (file: File) => Promise<{ error?: string } | void>;
  isAdmin?: boolean;
};

export function ProfileSection({ initialData, onSave, onUploadAvatar, isAdmin }: ProfileSectionProps) {
  const [form, setForm] = useState({
    name: initialData?.name || "",
    title: initialData?.title || "",
    phone: initialData?.phone || "",
    location: initialData?.location || "",
    bio: initialData?.bio || "",
  });
  const [avatarUrl, setAvatarUrl] = useState(initialData?.avatar_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const rawPlan = initialData?.plan || "free_trial";
  const planLabel = rawPlan.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    setForm({
      name: initialData?.name || "",
      title: initialData?.title || "",
      phone: initialData?.phone || "",
      location: initialData?.location || "",
      bio: initialData?.bio || "",
    });
    setAvatarUrl(initialData?.avatar_url || "");
  }, [
    initialData?.name,
    initialData?.title,
    initialData?.phone,
    initialData?.location,
    initialData?.bio,
    initialData?.avatar_url,
  ]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await onSave?.(form);
      if ((result as any)?.error) {
        setError((result as any).error);
      } else {
        setSuccess("Profile saved");
      }
    } catch (e: any) {
      setError(e?.message || "Failed saving profile");
    } finally {
      setSaving(false);
    }
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

  return (
    <SectionShell
      title="User profile"
      description="Update your personal profile, contact details, and account identity."
    >
      <StatusMessage error={error} success={success} />
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="group relative mb-4 h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-slate-200 shadow"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-slate-600">
                  {(initialData?.name || "U").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                Change
              </div>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAvatarChange(e.target.files?.[0])}
            />
            <div className="text-lg font-semibold text-slate-900">{initialData?.name || "User"}</div>
            <div className="mt-1 text-sm text-slate-500">{initialData?.email || "—"}</div>
            <div className="mt-4 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              {planLabel}
            </div>
            <div className="mt-5 grid w-full grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-lg font-semibold text-slate-900">{initialData?.savedCount ?? 0}</div>
                <div className="text-xs text-slate-500">Saved</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-lg font-semibold text-slate-900">{initialData?.campaignsCount ?? 0}</div>
                <div className="text-xs text-slate-500">Campaigns</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-lg font-semibold text-slate-900">{initialData?.rfpsCount ?? 0}</div>
                <div className="text-xs text-slate-500">RFPs</div>
              </div>
            </div>
            <div className="mt-4 w-full">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="w-full"
              >
                <Upload size={16} />
                {uploading ? "Uploading..." : "Upload profile image"}
              </ActionButton>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name">
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Bio">
                <Textarea
                  rows={5}
                  value={form.bio}
                  onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <ActionButton onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </ActionButton>
          </div>
        </div>
      </div>
    </SectionShell>
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
    <SectionShell title="Access & Roles" description="Manage workspace access, roles, and pending invites.">
      <StatusMessage error={err} success={msg} />
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">Workspace members</div>
            <div className="text-sm text-slate-500">
              {members.length} active {seatLimit ? `of ${seatLimit} seats` : "members"}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {members.length ? (
            members.map((m: any) => {
              const isOwner = m.role === "owner";

              return (
                <div
                  key={m.id}
                  className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_180px_140px] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{m.full_name || m.email || "User"}</div>
                    <div className="truncate text-sm text-slate-500">{m.email || m.user_id}</div>
                  </div>
                  <Select
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
                  </Select>
                  <ActionButton
                    variant="danger"
                    disabled={!isAdmin || isOwner}
                    onClick={async () => {
                      setErr(null);
                      setMsg(null);
                      const result = await onRevoke?.(m.id);
                      if (result?.error) setErr(result.error);
                      else setMsg("Member removed");
                    }}
                  >
                    <Trash2 size={16} />
                    Remove
                  </ActionButton>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No members found.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-4 font-semibold text-slate-900">Invite user</div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@company.com" />
          <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
          <ActionButton
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
            <Plus size={16} />
            Invite
          </ActionButton>
        </div>

        <div className="mt-5 space-y-3">
          {invites.length ? (
            invites.map((invite: any) => (
              <div key={invite.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                <div>
                  <div className="font-medium text-slate-900">{invite.email}</div>
                  <div className="text-sm text-slate-500">{invite.role} • pending</div>
                </div>
                <ActionButton
                  variant="danger"
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
                </ActionButton>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No pending invites.
            </div>
          )}
        </div>
      </div>
    </SectionShell>
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
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(0,1fr)_repeat(3,80px)] gap-2 border-b border-slate-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 md:grid">
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
              className="grid grid-cols-[minmax(0,1fr)_repeat(3,56px)] items-center gap-2 px-5 py-3 md:grid-cols-[minmax(0,1fr)_repeat(3,80px)]"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{ev.label}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{ev.description}</div>
              </div>
              {channelMeta.map((c) => {
                const on = matrix[ev.id]?.[c.id] ?? false;
                return (
                  <div key={c.id} className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => toggle(ev.id, c.id)}
                      aria-pressed={on}
                      aria-label={`${ev.label} — ${c.label}`}
                      className={`relative h-5 w-9 rounded-full transition ${
                        on ? "bg-indigo-600" : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-all ${
                          on ? "left-4" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
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
          <ActionButton onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save notification settings"}
          </ActionButton>
        </div>
      </div>
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
