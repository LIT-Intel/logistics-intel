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
} from "lucide-react";

export type SettingsSectionId =
  | "Profile"
  | "Company & Signature"
  | "Email"
  | "LinkedIn"
  | "Access & Roles"
  | "Billing & Plans"
  | "RFP & Pipeline"
  | "Campaign Preferences"
  | "Alerts & Notifications"
  | "Security & API"
  | "Workspace Credits"
  | "Team Subscriptions";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  title: string;
  icon: React.ComponentType<any>;
}> = [
  { id: "Profile", title: "Profile", icon: User },
  { id: "Company & Signature", title: "Company & Signature", icon: Building2 },
  { id: "Email", title: "Email", icon: Mail },
  { id: "LinkedIn", title: "LinkedIn", icon: Linkedin },
  { id: "Access & Roles", title: "Access & Roles", icon: ShieldCheck },
  { id: "Billing & Plans", title: "Billing & Plans", icon: CreditCard },
  { id: "RFP & Pipeline", title: "RFP & Pipeline", icon: FileText },
  { id: "Campaign Preferences", title: "Campaign Preferences", icon: Megaphone },
  { id: "Alerts & Notifications", title: "Alerts & Notifications", icon: Bell },
  { id: "Security & API", title: "Security & API", icon: KeyRound },
  { id: "Workspace Credits", title: "Workspace Credits", icon: Coins },
  { id: "Team Subscriptions", title: "Team Subscriptions", icon: Users },
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

export function RfpPipelineSection({ preferences, onSavePreferences }: any) {
  const [state, setState] = useState(preferences || {});

  useEffect(() => {
    setState(preferences || {});
  }, [preferences]);

  return (
    <SectionShell title="RFP & Pipeline" description="Configure pipeline defaults for RFP workflows.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <Field label="Default pipeline owner">
          <Input value={state.owner || ""} onChange={(e) => setState((p: any) => ({ ...p, owner: e.target.value }))} />
        </Field>
        <div className="mt-5 flex justify-end">
          <ActionButton onClick={() => onSavePreferences?.(state)}>Save RFP settings</ActionButton>
        </div>
      </div>
    </SectionShell>
  );
}

export function CampaignPreferencesSection({ preferences, onSavePreferences }: any) {
  const [state, setState] = useState(preferences || {});

  useEffect(() => {
    setState(preferences || {});
  }, [preferences]);

  return (
    <SectionShell title="Campaign Preferences" description="Choose defaults for outbound campaign behavior.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <Field label="Default campaign sender">
          <Input value={state.sender || ""} onChange={(e) => setState((p: any) => ({ ...p, sender: e.target.value }))} />
        </Field>
        <div className="mt-5 flex justify-end">
          <ActionButton onClick={() => onSavePreferences?.(state)}>Save campaign settings</ActionButton>
        </div>
      </div>
    </SectionShell>
  );
}

export function AlertsNotificationsSection({ preferences, onSavePreferences }: any) {
  const [state, setState] = useState({
    emailAlerts: preferences?.emailAlerts ?? true,
    productUpdates: preferences?.productUpdates ?? true,
  });

  useEffect(() => {
    setState({
      emailAlerts: preferences?.emailAlerts ?? true,
      productUpdates: preferences?.productUpdates ?? true,
    });
  }, [preferences]);

  return (
    <SectionShell title="Alerts & Notifications" description="Decide what notifications you want to receive.">
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="space-y-4">
          <label className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <span className="text-sm font-medium text-slate-700">Email alerts</span>
            <input
              type="checkbox"
              checked={state.emailAlerts}
              onChange={(e) => setState((p) => ({ ...p, emailAlerts: e.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <span className="text-sm font-medium text-slate-700">Product updates</span>
            <input
              type="checkbox"
              checked={state.productUpdates}
              onChange={(e) => setState((p) => ({ ...p, productUpdates: e.target.checked }))}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <ActionButton onClick={() => onSavePreferences?.(state)}>Save notification settings</ActionButton>
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
