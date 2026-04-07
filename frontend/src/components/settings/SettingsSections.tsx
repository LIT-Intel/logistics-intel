import React from "react";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  Globe,
  KeyRound,
  Linkedin,
  Lock,
  Mail,
  MapPin,
  Shield,
  Sparkles,
  Users2,
  Zap,
  Chrome,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { KpiCard, Pill } from "./SettingsPrimitives";

const cardBase =
  "rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]";

export const SETTINGS_SECTIONS = [
  "Profile",
  "Company & Signature",
  "Email",
  "LinkedIn",
  "Access & Roles",
  "RFP & Pipeline",
  "Campaign Preferences",
  "Alerts & Notifications",
  "Security & API",
  "Workspace Credits",
  "Team Subscriptions",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

const inputClass =
  "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const toggleClass =
  "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition";

const Toggle = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={cn(
      toggleClass,
      checked
        ? "border-indigo-500 bg-indigo-500/90"
        : "border-slate-200 bg-slate-200",
    )}
  >
    <span
      className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white transition",
        checked ? "translate-x-5" : "translate-x-1",
      )}
    />
  </button>
);

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ProfileSectionProps = {
  initialData?: {
    name?: string;
    title?: string;
    phone?: string;
    location?: string;
    bio?: string;
    email?: string;
    plan?: string;
    savedCount?: number;
    campaignsCount?: number;
    rfpsCount?: number;
  };
  onSave?: (data: Record<string, string>) => Promise<{ error?: string }>;
  onUploadAvatar?: (file: File) => Promise<{ error?: string } | void>;
  isAdmin?: boolean;
};

export function ProfileSection({
  initialData,
  onSave,
  onUploadAvatar,
}: ProfileSectionProps = {}) {
  const [profile, setProfile] = React.useState({
    name: initialData?.name || "",
    title: initialData?.title || "",
    phone: initialData?.phone || "",
    location: initialData?.location || "",
    bio: initialData?.bio || "",
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setProfile({
      name: initialData?.name || "",
      title: initialData?.title || "",
      phone: initialData?.phone || "",
      location: initialData?.location || "",
      bio: initialData?.bio || "",
    });
  }, [initialData?.name, initialData?.title, initialData?.phone, initialData?.location, initialData?.bio]);

  const email = initialData?.email || "";
  const plan = initialData?.plan || "free_trial";
  const savedCount = initialData?.savedCount ?? 0;
  const campaignsCount = initialData?.campaignsCount ?? 0;
  const rfpsCount = initialData?.rfpsCount ?? 0;
  const avatarUrl = initialData?.avatar_url || "";

  const initials = React.useMemo(() => {
    const src = (profile.name || email || "U").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }, [profile.name, email]);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await onSave(profile);
      if (result?.error) {
        setSaveError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e: any) {
      setSaveError(e?.message ?? "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarFile(file?: File | null) {
    if (!file || !onUploadAvatar) return;
    setUploadingAvatar(true);
    setSaveError(null);
    try {
      const result = await onUploadAvatar(file);
      if ((result as any)?.error) {
        setSaveError((result as any).error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e: any) {
      setSaveError(e?.message ?? "Avatar upload failed.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const planLabel =
    plan === "admin" ? "Admin"
    : plan === "unlimited" ? "Unlimited"
    : plan === "free_trial" ? "Free Trial"
    : plan === "standard" ? "Standard"
    : plan === "growth" ? "Growth"
    : plan === "enterprise" ? "Enterprise"
    : plan;

  return (
    <section className={cardBase}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={profile.name || "Profile avatar"}
                className="h-20 w-20 rounded-full object-cover ring-4 ring-white shadow-md"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-2xl font-bold text-white ring-4 ring-white shadow-md">
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar || !onUploadAvatar}
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
              title="Upload photo"
            >
              <Globe className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAvatarFile(e.target.files?.[0])}
            />
          </div>

          <div>
            <Pill label="Personal Information" tone="primary" />
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              {profile.name || "Your profile"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {profile.title || "Add your title"}
              {profile.location ? ` · ${profile.location}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                {planLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 lg:min-w-[420px]">
          <div className="text-center">
            <p className="text-2xl font-semibold text-slate-900">{savedCount}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              Saved Companies
            </p>
          </div>
          <div className="border-x border-slate-200 text-center">
            <p className="text-2xl font-semibold text-slate-900">{campaignsCount}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              Campaigns
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-slate-900">{rfpsCount}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              RFPs
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 mb-5">
        <p className="text-sm text-slate-600">
          Keep your LIT Search profile, signature, and contact details aligned with your team.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Full name
          <input
            className={inputClass}
            value={profile.name}
            onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Enter your name"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Title / Role
          <input
            className={inputClass}
            value={profile.title}
            onChange={(e) => setProfile((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Title"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Phone
          <input
            className={inputClass}
            value={profile.phone}
            onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+1 (555) 123-4567"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Location
          <input
            className={inputClass}
            value={profile.location}
            onChange={(e) => setProfile((prev) => ({ ...prev, location: e.target.value }))}
            placeholder="City, Country"
          />
        </label>
        {email && (
          <label className="text-sm font-semibold text-slate-700">
            Email address
            <input
              className={cn(inputClass, "cursor-not-allowed bg-slate-50 text-slate-400")}
              value={email}
              readOnly
            />
            <span className="mt-1 block text-xs text-slate-400">Managed by your auth provider</span>
          </label>
        )}
        <label className="md:col-span-2">
          <span className="text-sm font-semibold text-slate-700">What should prospects know?</span>
          <textarea
            className={cn(inputClass, "min-h-[100px] resize-none")}
            value={profile.bio}
            onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Saved successfully
          </span>
        )}
        {saveError && (
          <span className="flex items-center gap-1.5 text-sm text-rose-600">
            <AlertTriangle className="h-4 w-4" /> {saveError}
          </span>
        )}
        <button
          type="button"
          disabled={saving || !onSave}
          onClick={handleSave}
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-md shadow-slate-900/20 transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </section>
  );
}


type CompanySignatureSectionPropstype CompanySignatureSectionProps = {
  orgProfile?: {
    name?: string;
    tagline?: string;
    website?: string;
    industry?: string;
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
}: CompanySignatureSectionProps = {}) {
  const [form, setForm] = React.useState({
    company: orgProfile?.name ?? "",
    tagline: orgProfile?.tagline ?? "",
    website: orgProfile?.website ?? "",
    supportEmail: orgProfile?.supportEmail ?? "",
    address: orgProfile?.address ?? "",
    timezone: orgProfile?.timezone ?? "",
    signature: emailSignature ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);

  React.useEffect(() => {
    setForm({
      company: orgProfile?.name ?? "",
      tagline: orgProfile?.tagline ?? "",
      website: orgProfile?.website ?? "",
      supportEmail: orgProfile?.supportEmail ?? "",
      address: orgProfile?.address ?? "",
      timezone: orgProfile?.timezone ?? "",
      signature: emailSignature ?? "",
    });
  }, [
    orgProfile?.name,
    orgProfile?.tagline,
    orgProfile?.website,
    orgProfile?.supportEmail,
    orgProfile?.address,
    orgProfile?.timezone,
    emailSignature,
  ]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const orgResult = await onSaveOrg?.({
        company: form.company,
        tagline: form.tagline,
        website: form.website,
        supportEmail: form.supportEmail,
        address: form.address,
        timezone: form.timezone,
      });

      if ((orgResult as any)?.error) {
        setSaveError((orgResult as any).error);
        return;
      }

      const sigResult = await onSaveSignature?.(form.signature);
      if ((sigResult as any)?.error) {
        setSaveError((sigResult as any).error);
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed saving company settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file?: File | null) => {
    if (!file || !onUploadLogo) return;
    setUploadingLogo(true);
    setSaveError(null);
    try {
      const result = await onUploadLogo(file);
      if ((result as any)?.error) {
        setSaveError((result as any).error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed uploading logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Company & Signature" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Workspace identity
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Control the branding applied to emails and Command Center exports.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Company name
          <input
            className={inputClass}
            value={form.company}
            onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Tagline
          <input
            className={inputClass}
            value={form.tagline}
            onChange={(e) => setForm((prev) => ({ ...prev, tagline: e.target.value }))}
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Website
          <input
            className={inputClass}
            value={form.website}
            onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Support email
          <input
            className={inputClass}
            value={form.supportEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, supportEmail: e.target.value }))}
            placeholder="support@company.com"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Address
          <input
            className={inputClass}
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            placeholder="Business address"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Timezone
          <input
            className={inputClass}
            value={form.timezone}
            onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
            placeholder="America/New_York"
          />
        </label>
        <label className="md:col-span-2 text-sm font-semibold text-slate-700">
          Email signature
          <textarea
            className={cn(inputClass, "min-h-[120px] resize-none")}
            value={form.signature}
            onChange={(e) => setForm((prev) => ({ ...prev, signature: e.target.value }))}
          />
        </label>
      </div>

      <div className="mt-4">
        <label className="text-sm font-semibold text-slate-700">
          Company logo
          <input
            type="file"
            accept="image/*"
            className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-slate-200"
            onChange={(e) => handleLogoUpload(e.target.files?.[0])}
            disabled={uploadingLogo || !onUploadLogo}
          />
          {uploadingLogo && <span className="mt-2 block text-xs text-slate-500">Uploading logo…</span>}
        </label>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Building2 className="h-4 w-4 text-indigo-500" />
            Company preview
          </div>
          <div className="mt-3 rounded-2xl border border-white bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
              {(form.company || "Your Company").toUpperCase()}
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {form.tagline || "Your tagline here"}
            </p>
            <p className="mt-1 text-sm text-slate-600">{form.website || "yourwebsite.com"}</p>
            {(form.supportEmail || form.timezone) && (
              <p className="mt-2 text-xs text-slate-500">
                {[form.supportEmail, form.timezone].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Signature preview
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-700">
            {form.signature || "No signature set"}
          </pre>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Saved successfully
          </span>
        )}
        {saveError && (
          <span className="flex items-center gap-1.5 text-sm text-rose-600">
            <AlertTriangle className="h-4 w-4" /> {saveError}
          </span>
        )}
      </div>
    </section>
  );
}


type EmailSectionIntegrationtype EmailSectionIntegration = {
  id: string;
  integration_type?: string;
  type?: string;
  created_at: string;
};

type EmailSectionProps = {
  integrations?: EmailSectionIntegration[];
  preferences?: Record<string, unknown>;
  onSavePreferences?: (data: Record<string, unknown>) => void;
  onDisconnect?: (id: string) => Promise<void>;
};

export function EmailSection({
  integrations = [],
  onDisconnect,
}: EmailSectionProps = {}) {
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = React.useState(false);

  // Support both integration_type (DB column) and type (legacy)
  const connectedInboxes = integrations.filter((i) => {
    const t = i.integration_type ?? i.type ?? "";
    return t === "gmail" || t === "outlook";
  });

  const handleDisconnect = async (id: string) => {
    setDisconnecting(id);
    try {
      await onDisconnect?.(id);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleConnectGmail = async () => {
    setConnecting("gmail");
    setShowAddMenu(false);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
          redirectTo: `${window.location.origin}/auth/callback?next=/app/settings`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
    } catch {
      setConnecting(null);
    }
  };

  const handleConnectOutlook = async () => {
    setConnecting("outlook");
    setShowAddMenu(false);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          scopes: "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read",
          redirectTo: `${window.location.origin}/auth/callback?next=/app/settings`,
        },
      });
    } catch {
      setConnecting(null);
    }
  };

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Email" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Connected inboxes
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Route LIT Search campaigns through Gmail, Outlook, or custom SMTP.
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddMenu((v) => !v)}
            disabled={!!connecting}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Mail className="h-4 w-4" />
            {connecting ? `Connecting ${connecting}…` : "Add inbox"}
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-10 z-10 w-52 rounded-2xl border border-slate-200 bg-white shadow-lg">
              <button
                type="button"
                onClick={handleConnectGmail}
                className="flex w-full items-center gap-3 rounded-t-2xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Chrome className="h-4 w-4 text-red-500" />
                Connect Gmail
              </button>
              <button
                type="button"
                onClick={handleConnectOutlook}
                className="flex w-full items-center gap-3 rounded-b-2xl border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Mail className="h-4 w-4 text-sky-600" />
                Connect Outlook
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {connectedInboxes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
            <Mail className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">No inboxes connected</p>
            <p className="mt-1 text-xs text-slate-400">Connect Gmail or Outlook to start sending campaigns.</p>
            <div className="mt-4 flex justify-center gap-3">
              <button type="button" onClick={handleConnectGmail} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700">
                <Chrome className="h-3.5 w-3.5" /> Gmail
              </button>
              <button type="button" onClick={handleConnectOutlook} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Mail className="h-3.5 w-3.5 text-sky-600" /> Outlook
              </button>
            </div>
          </div>
        ) : (
          connectedInboxes.map((inbox) => {
            const t = inbox.integration_type ?? inbox.type ?? "";
            const isGmail = t === "gmail";
            const connectedAt = inbox.created_at
              ? new Date(inbox.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : null;
            return (
              <div
                key={inbox.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 capitalize">
                    {isGmail ? "Gmail" : "Outlook"}
                  </p>
                  {connectedAt && (
                    <p className="text-xs text-slate-500">Connected {connectedAt}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Connected
                  </span>
                  <button
                    type="button"
                    disabled={disconnecting === inbox.id}
                    onClick={() => handleDisconnect(inbox.id)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-500 disabled:opacity-60"
                  >
                    {disconnecting === inbox.id ? "Removing…" : "Disconnect"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Deliverability
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {connectedInboxes.length > 0
              ? "DKIM, SPF, and DMARC checks are passing for connected inboxes."
              : "Connect an inbox to run deliverability checks."}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Sending window
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Campaigns deploy Mon–Fri, 7:30a – 6:30p in recipient's local time.
          </p>
        </div>
      </div>
    </section>
  );
}

type LinkedInSectionProps = {
  preferences?: Record<string, unknown>;
  onSavePreferences?: (data: Record<string, unknown>) => void;
};

export function LinkedInSection({ preferences, onSavePreferences }: LinkedInSectionProps = {}) {
  const [automations, setAutomations] = React.useState({
    syncReplies: (preferences?.syncReplies as boolean) ?? true,
    shareSignals: (preferences?.shareSignals as boolean) ?? false,
    autoVisit: (preferences?.autoVisit as boolean) ?? true,
  });

  React.useEffect(() => {
    setAutomations({
      syncReplies: (preferences?.syncReplies as boolean) ?? true,
      shareSignals: (preferences?.shareSignals as boolean) ?? false,
      autoVisit: (preferences?.autoVisit as boolean) ?? true,
    });
  }, [preferences?.syncReplies, preferences?.shareSignals, preferences?.autoVisit]);

  const handleToggle = (key: keyof typeof automations, value: boolean) => {
    const updated = { ...automations, [key]: value };
    setAutomations(updated);
    onSavePreferences?.(updated);
  };

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="LinkedIn" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Social outreach
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Keep LinkedIn messaging aligned with your campaign rhythms.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Linkedin className="h-4 w-4 text-sky-600" />
          Connect account
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Playbooks
          </p>
          <p className="mt-2 text-sm text-slate-600">
            "Intro + value" and "Ops pulse" active for retail shippers.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Velocity
          </p>
          <p className="mt-2 text-sm text-slate-600">
            28 daily connection invites across ops teams in AMER + EMEA.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Tone
          </p>
          <p className="mt-2 text-sm text-slate-600">
            "Curious advisor" voice with one CTA per thread.
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {[
          { key: "syncReplies" as const, label: "Sync replies to Command Center timelines" },
          { key: "shareSignals" as const, label: "Share engagement signals with salesforce team" },
          { key: "autoVisit" as const, label: "Auto-visit profiles before a message is sent" },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/80 px-4 py-3"
          >
            <p className="text-sm font-semibold text-slate-800">{item.label}</p>
            <Toggle
              checked={automations[item.key]}
              onChange={(value) => handleToggle(item.key, value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

type OrgMember = {
  id?: string;
  user_id?: string;
  email?: string;
  full_name?: string;
  role: string;
  status?: string;
  created_at?: string;
};

type OrgInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at?: string;
};

type AccessRolesSectionProps = {
  members?: OrgMember[];
  invites?: OrgInvite[];
  seatLimit?: number;
  isAdmin?: boolean;
  onInvite?: (email: string, role: string) => Promise<{ error?: string } | void>;
  onRevoke?: (memberId: string) => Promise<{ error?: string } | void>;
  onUpdateRole?: (memberId: string, role: string) => Promise<{ error?: string } | void>;
  onRevokeInvite?: (inviteId: string) => Promise<{ error?: string } | void>;
};

const ROLE_STYLES: Record<string, string> = {
  owner:       "bg-emerald-100 text-emerald-700",
  admin:       "bg-indigo-100 text-indigo-700",
  contributor: "bg-amber-100 text-amber-700",
  viewer:      "bg-slate-100 text-slate-600",
};

const SCOPE_LABELS: Record<string, string> = {
  owner:       "Full access",
  admin:       "Billing + Command Center",
  contributor: "Campaigns + Search",
  viewer:      "Saved companies only",
};

const MOCK_MEMBERS: OrgMember[] = [
  { id: "1", full_name: "Ava Patel",     role: "owner",       status: "active" },
  { id: "2", full_name: "Noor Idris",    role: "admin",       status: "active" },
  { id: "3", full_name: "Elliot Warren", role: "contributor", status: "active" },
  { id: "4", full_name: "Lena Cho",      role: "viewer",      status: "pending" },
];

function getInitials(name?: string, email?: string): string {
  const label = name || email || "?";
  return label.split(/[\s@]/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-violet-500",
];

export function AccessRolesSection({
  members = [],
  invites = [],
  seatLimit,
  isAdmin,
  onInvite,
  onRevoke,
  onUpdateRole,
  onRevokeInvite,
}: AccessRolesSectionProps = {}) {
  const team = members;
  const seatUsed = team.length;
  const seatTotal = seatLimit ?? 10;
  const seatPct = seatTotal > 0 ? Math.min(100, Math.round((seatUsed / seatTotal) * 100)) : 0;

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("contributor");
  const [inviting, setInviting] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const result = await onInvite?.(inviteEmail.trim(), inviteRole);
      if ((result as any)?.error) {
        setInviteError((result as any).error);
        return;
      }
      setInviteEmail("");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (memberId: string) => {
    setRevoking(memberId);
    setActionError(null);
    try {
      const result = await onRevoke?.(memberId);
      if ((result as any)?.error) setActionError((result as any).error);
    } finally {
      setRevoking(null);
    }
  };

  const handleRoleUpdate = async (memberId: string, role: string) => {
    setActionError(null);
    const result = await onUpdateRole?.(memberId, role);
    if ((result as any)?.error) setActionError((result as any).error);
  };

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Access & Roles" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Workspace permissions
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Control who can edit LIT Search cadences, billing, and saved shippers.
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            type="email"
            placeholder="teammate@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className={cn(inputClass, "mt-0 min-w-[200px] flex-1")}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="admin">Admin</option>
            <option value="contributor">Contributor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Users2 className="h-4 w-4" />
            {inviting ? "Inviting…" : "Invite"}
          </button>
        </div>
      )}

      {(inviteError || actionError) && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {inviteError || actionError}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-slate-800 transition-all" style={{ width: `${seatPct}%` }} />
        </div>
        <span className="whitespace-nowrap text-xs font-semibold text-slate-500">
          {seatUsed} / {seatTotal} seats used
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-100 overflow-x-auto">
        <div className="min-w-[500px]">
          <div className="grid grid-cols-[2fr_1fr_1fr_80px] gap-4 border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            <span>Member</span>
            <span>Role</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {team.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No workspace members found yet.
            </div>
          ) : (
            team.map((member, idx) => {
              const roleKey = member.role?.toLowerCase() ?? "viewer";
              const roleStyle = ROLE_STYLES[roleKey] ?? ROLE_STYLES.viewer;
              const scope = SCOPE_LABELS[roleKey] ?? member.role;
              const displayName = member.full_name || member.email || member.user_id || "Unknown";
              const initials = getInitials(member.full_name, member.email);
              const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              const isActive = (member.status ?? "active") === "active";
              const memberId = member.id ?? member.user_id ?? String(idx);

              return (
                <div
                  key={memberId}
                  className="grid grid-cols-[2fr_1fr_1fr_80px] items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", avatarColor)}>
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{displayName}</p>
                      {member.email && member.full_name && (
                        <p className="text-xs text-slate-400">{member.email}</p>
                      )}
                      <p className="text-xs text-slate-400">{scope}</p>
                    </div>
                  </div>
                  {isAdmin && onUpdateRole ? (
                    <select
                      value={roleKey}
                      onChange={(e) => handleRoleUpdate(memberId, e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="contributor">Contributor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", roleStyle)}>
                      {roleKey}
                    </span>
                  )}
                  <span className={cn(
                    "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    isActive ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-green-500" : "bg-yellow-500")} />
                    {isActive ? "Active" : "Pending"}
                  </span>
                  {isAdmin && onRevoke && roleKey !== "owner" ? (
                    <button
                      type="button"
                      onClick={() => handleRevoke(memberId)}
                      disabled={revoking === memberId}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-60"
                    >
                      {revoking === memberId ? "…" : "Revoke"}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {invites.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Pending invites</p>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{invite.email}</p>
                  <p className="text-xs text-slate-400 capitalize">
                    {invite.role} • Invited {new Date(invite.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                {isAdmin && onRevokeInvite && (
                  <button
                    type="button"
                    onClick={() => onRevokeInvite(invite.id)}
                    className="text-xs font-semibold text-slate-500 hover:text-rose-600"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            SSO
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Google Workspace enabled • SCIM sync coming soon.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            Audit trail
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Security events tracked in real time. View in Security & API tab.
          </p>
        </div>
      </div>
    </section>
  );
}


type BillingPlanDatatype BillingPlanData = {
  plan_code: string;
  display_name?: string;
  price_monthly?: number;
  price_yearly?: number;
  features?: string[] | Record<string, unknown>;
  seat_limit?: number;
};

type BillingSubscription = {
  plan_code?: string;
  status?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  seat_limit?: number;
  stripe_customer_id?: string;
};

type BillingPlansSectionProps = {
  subscription?: BillingSubscription;
  plans?: BillingPlanData[];
  isAdmin?: boolean;
};

function formatPlanPrice(plan: BillingPlanData): string {
  if (!plan.price_monthly || plan.price_monthly === 0) return "$0";
  return `$${plan.price_monthly.toLocaleString()}`;
}

function getPlanFeatureList(plan: BillingPlanData): string[] {
  if (!plan.features) return [];
  if (Array.isArray(plan.features)) return plan.features as string[];
  return Object.entries(plan.features).map(([k, v]) => `${k}: ${v}`);
}

export function BillingPlansSection({
  subscription,
  plans = [],
  isAdmin,
}: BillingPlansSectionProps = {}) {
  const currentCode = subscription?.plan_code ?? "free_trial";
  const currentPlan = plans.find((p) => p.plan_code === currentCode);
  const otherPlans = plans.filter((p) => p.plan_code !== currentCode);

  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const statusLabel =
    subscription?.status === "active" ? "Active" :
    subscription?.status === "past_due" ? "Past due" :
    subscription?.status === "canceled" ? "Canceled" : "Trial";

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Billing & Plans" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Subscription controls
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Monitor spend, invoices, and upgrade when volumes spike.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Sparkles className="h-4 w-4 text-indigo-500" />
          Manage billing
        </button>
      </div>

      {/* Current plan */}
      {currentPlan ? (
        <div className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50/40 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Current plan</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {(currentPlan.display_name ?? (currentPlan.plan_code ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())) || "Free Trial"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatPlanPrice(currentPlan)}/month
                {currentPlan.seat_limit ? ` · ${currentPlan.seat_limit} seats` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Pill label={statusLabel} tone={subscription?.status === "active" ? "success" : "primary"} />
              {renewalDate && (
                <p className="text-xs text-slate-500">
                  {subscription?.cancel_at_period_end ? "Cancels" : "Renews"} {renewalDate}
                </p>
              )}
            </div>
          </div>
          {currentPlan.features && (
            <ul className="mt-4 flex flex-wrap gap-3">
              {getPlanFeatureList(currentPlan).map((f) => (
                <li key={f} className="flex items-center gap-1 text-sm text-slate-600">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-slate-100 bg-white/90 p-6">
          <p className="text-sm text-slate-500">No active subscription found.</p>
        </div>
      )}

      {/* Other plans */}
      {otherPlans.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {otherPlans.slice(0, 4).map((plan) => (
            <div
              key={plan.plan_code}
              className="flex flex-col rounded-3xl border border-slate-100 bg-white/90 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                    {(plan.display_name ?? (plan.plan_code ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())) || "Plan"}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {plan.price_monthly ? `$${plan.price_monthly.toLocaleString()}` : "Custom"}
                    {plan.price_monthly ? <span className="text-base font-medium text-slate-500">/mo</span> : ""}
                  </p>
                </div>
              </div>
              {plan.features && (
                <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {getPlanFeatureList(plan).slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="mt-5 rounded-full border border-indigo-200 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Upgrade
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type RfpPipelineSectionProps = {
  preferences?: Record<string, unknown>;
  onSavePreferences?: (data: Record<string, unknown>) => void;
};

export function RfpPipelineSection({ preferences, onSavePreferences }: RfpPipelineSectionProps = {}) {
  const [settings, setSettings] = React.useState({
    autoCrmSync: (preferences?.autoCrmSync as boolean) ?? false,
    trackPipelineValue: (preferences?.trackPipelineValue as boolean) ?? true,
    defaultStage: (preferences?.defaultStage as string) ?? "Qualification",
  });

  React.useEffect(() => {
    setSettings({
      autoCrmSync: (preferences?.autoCrmSync as boolean) ?? false,
      trackPipelineValue: (preferences?.trackPipelineValue as boolean) ?? true,
      defaultStage: (preferences?.defaultStage as string) ?? "Qualification",
    });
  }, [preferences?.autoCrmSync, preferences?.trackPipelineValue, preferences?.defaultStage]);

  const handleToggle = (key: "autoCrmSync" | "trackPipelineValue", value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    onSavePreferences?.(updated);
  };

  const stages = [
    { label: "Qualification", companies: "—", value: "—" },
    { label: "Pricing in progress", companies: "—", value: "—" },
    { label: "Executive review", companies: "—", value: "—" },
  ];

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="RFP & Pipeline" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Deal pipeline
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Keep Command Center routes tied to live RFP stages.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Briefcase className="h-4 w-4" />
          Sync CRM
        </button>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className="rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
              {stage.label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">
              {stage.companies}
              {stage.companies !== "—" && (
                <span className="text-base font-medium text-slate-500"> companies</span>
              )}
            </p>
            {stage.value !== "—" && (
              <p className="mt-1 text-sm text-slate-600">Weighted pipeline {stage.value}</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {[
          { key: "autoCrmSync" as const, label: "Auto-sync pipeline stages to CRM" },
          { key: "trackPipelineValue" as const, label: "Track weighted pipeline value" },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/80 px-4 py-3"
          >
            <p className="text-sm font-semibold text-slate-800">{item.label}</p>
            <Toggle
              checked={settings[item.key]}
              onChange={(value) => handleToggle(item.key, value)}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
        <label className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
          Default entry stage
          <select
            value={settings.defaultStage}
            onChange={(e) => {
              const updated = { ...settings, defaultStage: e.target.value };
              setSettings(updated);
              onSavePreferences?.(updated);
            }}
            className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none"
          >
            <option>Qualification</option>
            <option>Pricing in progress</option>
            <option>Executive review</option>
          </select>
        </label>
      </div>
    </section>
  );
}

type CampaignPreferencesSectionProps = {
  preferences?: Record<string, unknown>;
  onSavePreferences?: (data: Record<string, unknown>) => void;
};

export function CampaignPreferencesSection({ preferences, onSavePreferences }: CampaignPreferencesSectionProps = {}) {
  const [settings, setSettings] = React.useState({
    autopilot: (preferences?.autopilot as boolean) ?? true,
    personalizedFirstLines: (preferences?.personalizedFirstLines as boolean) ?? true,
    dropInCallouts: (preferences?.dropInCallouts as boolean) ?? false,
    autoPause: (preferences?.autoPause as boolean) ?? true,
  });

  React.useEffect(() => {
    setSettings({
      autopilot: (preferences?.autopilot as boolean) ?? true,
      personalizedFirstLines: (preferences?.personalizedFirstLines as boolean) ?? true,
      dropInCallouts: (preferences?.dropInCallouts as boolean) ?? false,
      autoPause: (preferences?.autoPause as boolean) ?? true,
    });
  }, [preferences?.autopilot, preferences?.personalizedFirstLines, preferences?.dropInCallouts, preferences?.autoPause]);

  const toggles = [
    { key: "autopilot" as const, label: "Auto-schedule new LIT Search cadences" },
    { key: "personalizedFirstLines" as const, label: "Personalize first lines via AI" },
    { key: "dropInCallouts" as const, label: "Add Command Center callouts" },
    { key: "autoPause" as const, label: "Pause sequences when booked meetings sync" },
  ];

  const handleToggle = (key: keyof typeof settings, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    onSavePreferences?.(updated);
  };

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Campaign Preferences" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Outreach rhythm
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Tune how cadences behave once shippers are saved from LIT Search.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Zap className="h-4 w-4 text-amber-500" />
          Apply template
        </button>
      </div>
      <div className="mt-6 space-y-4">
        {toggles.map((toggle) => (
          <div
            key={toggle.key}
            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/80 px-4 py-3"
          >
            <p className="text-sm font-semibold text-slate-800">{toggle.label}</p>
            <Toggle
              checked={settings[toggle.key]}
              onChange={(value) => handleToggle(toggle.key, value)}
            />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            Snippets
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Campaign snippets available for LIT Search outreach sequences.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            Escalations
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Auto-create Slack threads for high-priority shippers.
          </p>
        </div>
      </div>
    </section>
  );
}

type AlertsNotificationsSectionProps = {
  preferences?: Record<string, unknown>;
  onSavePreferences?: (data: Record<string, unknown>) => void;
};

export function AlertsNotificationsSection({ preferences, onSavePreferences }: AlertsNotificationsSectionProps = {}) {
  const [alerts, setAlerts] = React.useState({
    shipmentDrops: (preferences?.shipmentDrops as boolean) ?? true,
    newSavedCompany: (preferences?.newSavedCompany as boolean) ?? true,
    creditUsage: (preferences?.creditUsage as boolean) ?? false,
    weeklyDigest: (preferences?.weeklyDigest as boolean) ?? true,
  });

  React.useEffect(() => {
    setAlerts({
      shipmentDrops: (preferences?.shipmentDrops as boolean) ?? true,
      newSavedCompany: (preferences?.newSavedCompany as boolean) ?? true,
      creditUsage: (preferences?.creditUsage as boolean) ?? false,
      weeklyDigest: (preferences?.weeklyDigest as boolean) ?? true,
    });
  }, [preferences?.shipmentDrops, preferences?.newSavedCompany, preferences?.creditUsage, preferences?.weeklyDigest]);

  const handleToggle = (key: keyof typeof alerts, value: boolean) => {
    const updated = { ...alerts, [key]: value };
    setAlerts(updated);
    onSavePreferences?.(updated);
  };

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Alerts & Notifications" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Signal routing
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Decide which insights from LIT Search get piped to email, Slack, or SMS.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Bell className="h-4 w-4 text-amber-500" />
          Configure channels
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {([
          { key: "shipmentDrops" as const, title: "Shipment drops", body: "Alert when a saved shipper's volume falls >15% MoM." },
          { key: "newSavedCompany" as const, title: "New saved company", body: "Ping account teams when someone bookmarks from LIT Search." },
          { key: "creditUsage" as const, title: "Credit usage", body: "Warn RevOps when LIT Search credits exceed 80%." },
          { key: "weeklyDigest" as const, title: "Weekly digest", body: "Sunday recap of Command Center KPIs." },
        ]).map((alert) => (
          <div
            key={alert.key}
            className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
          >
            <div className="rounded-2xl bg-slate-900/5 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                <Toggle
                  checked={alerts[alert.key]}
                  onChange={(value) => handleToggle(alert.key, value)}
                />
              </div>
              <p className="mt-1 text-sm text-slate-600">{alert.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type ApiKey = {
  id: string;
  key_name: string;
  key_prefix: string;
  last_used_at?: string;
  created_at: string;
};

type AuditEvent = {
  id: string;
  action: string;
  ip_address?: string;
  created_at: string;
};

type SecurityApiSectionProps = {
  apiKeys?: ApiKey[];
  auditLog?: AuditEvent[];
  onGenerateKey?: (keyName: string) => Promise<string | null>;
  onRevokeKey?: (keyId: string) => Promise<void>;
};

export function SecurityApiSection({ apiKeys = [], auditLog = [], onGenerateKey, onRevokeKey }: SecurityApiSectionProps = {}) {
  const [newKeyName, setNewKeyName] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  const handleGenerate = async () => {
    if (!newKeyName.trim() || !onGenerateKey) return;
    setGenerating(true);
    try {
      const key = await onGenerateKey(newKeyName.trim());
      if (key) setGeneratedKey(key);
      setNewKeyName("");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevoking(keyId);
    try {
      await onRevokeKey?.(keyId);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Security & API" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Protect workspace data
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Generate API keys, review access events, and lock down exports.
          </p>
        </div>
      </div>

      {/* Generate new key */}
      {onGenerateKey && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Key name (e.g. Search automation)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className={cn(inputClass, "flex-1 min-w-[200px] mt-0")}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !newKeyName.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" />
            {generating ? "Generating…" : "Generate key"}
          </button>
        </div>
      )}

      {/* Show newly generated key once */}
      {generatedKey && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-700 mb-1">New API key — copy now, it won't be shown again</p>
          <code className="block break-all rounded-xl bg-white px-3 py-2 text-sm font-mono text-slate-800 border border-emerald-100">
            {generatedKey}
          </code>
          <button
            type="button"
            onClick={() => setGeneratedKey(null)}
            className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-600"
          >
            Done
          </button>
        </div>
      )}

      {/* API Keys list */}
      <div className="mt-6 rounded-2xl border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
          <span>API key</span>
          <span>Last used</span>
        </div>
        {apiKeys.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-slate-400">No API keys generated yet.</div>
        ) : (
          apiKeys.map((key) => {
            const lastUsed = key.last_used_at
              ? new Date(key.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "Never";
            return (
              <div
                key={key.id}
                className="flex items-center justify-between border-b border-slate-100 px-5 py-4 text-sm last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 text-indigo-500" />
                  <div>
                    <span className="font-semibold text-slate-900">{key.key_name}</span>
                    <span className="ml-2 text-xs text-slate-400 font-mono">{key.key_prefix}…</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-slate-500">
                  {lastUsed}
                  {onRevokeKey && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(key.id)}
                      disabled={revoking === key.id}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-500 disabled:opacity-60"
                    >
                      {revoking === key.id ? "…" : "Revoke"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Audit log */}
      {auditLog.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500 mb-2">Recent security events</p>
          <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100">
            {auditLog.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-medium text-slate-700 capitalize">{event.action.replace(/_/g, " ")}</span>
                  {event.ip_address && (
                    <span className="text-xs text-slate-400">from {event.ip_address}</span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(event.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type TokenUsage = {
  feature: string;
  tokens_used: number;
};

type WorkspaceCreditsSectionProps = {
  tokenUsage?: TokenUsage[];
  subscription?: {
    plan_code?: string;
    seat_limit?: number;
    status?: string;
  };
  isAdmin?: boolean;
};

const FEATURE_LIMITS: Record<string, { label: string; limit: number; accent: "indigo" | "emerald" | "sky" | "slate" }> = {
  lit_search: { label: "LIT Search credits", limit: 1000, accent: "indigo" },
  enrichment: { label: "Enrichment credits", limit: 800, accent: "emerald" },
  campaigns: { label: "Campaign sends", limit: 3000, accent: "sky" },
  command_center: { label: "Command Center briefs", limit: 40, accent: "slate" },
};

export function WorkspaceCreditsSection({ tokenUsage = [], subscription, isAdmin }: WorkspaceCreditsSectionProps = {}) {
  const usageMap = Object.fromEntries(tokenUsage.map((t) => [t.feature, t.tokens_used]));

  const kpiItems = Object.entries(FEATURE_LIMITS).map(([feature, meta]) => {
    const used = usageMap[feature] ?? 0;
    const pct = Math.min(100, Math.round((used / meta.limit) * 100));
    return {
      title: meta.label,
      value: `${used.toLocaleString()} / ${meta.limit.toLocaleString()}`,
      helper: `${pct}% used`,
      accent: meta.accent,
      usage: pct,
      feature,
    };
  });

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Workspace Credits" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Usage across teams
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Track LIT Search, enrichment, and campaign credits in one place.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Globe className="h-4 w-4 text-slate-500" />
          Export report
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {kpiItems.map((item) => (
          <KpiCard
            key={item.feature}
            title={item.title}
            value={item.value}
            helper={item.helper}
            accent={item.accent}
          />
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {kpiItems.slice(0, 3).map((item) => (
          <div
            key={item.feature}
            className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
              <span>{FEATURE_LIMITS[item.feature]?.label?.split(" ")[0] ?? item.feature}</span>
              <span>{item.usage}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r from-indigo-500 to-slate-900",
                  item.usage >= 90 ? "from-rose-500 to-rose-700" : ""
                )}
                style={{ width: `${item.usage}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-600">{item.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

type TeamMember = {
  id?: string;
  user_id?: string;
  email?: string;
  full_name?: string;
  role: string;
  status?: string;
  created_at?: string;
};

type TeamSubscriptionsSectionProps = {
  members?: TeamMember[];
  subscription?: {
    plan_code?: string;
    status?: string;
    seat_limit?: number;
    current_period_end?: string;
  };
  isAdmin?: boolean;
};

export function TeamSubscriptionsSection({ members = [], subscription, isAdmin }: TeamSubscriptionsSectionProps = {}) {
  const seatLimit = subscription?.seat_limit ?? 10;
  const seatUsed = members.length;
  const seatsRemaining = Math.max(0, seatLimit - seatUsed);
  const planName = subscription?.plan_code
    ? subscription.plan_code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Free Trial";

  // Group members by role
  const byRole = members.reduce<Record<string, TeamMember[]>>((acc, m) => {
    const r = m.role ?? "viewer";
    acc[r] = [...(acc[r] ?? []), m];
    return acc;
  }, {});

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Team Subscriptions" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Seat allocation
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Assign Command Center, campaign, or analyst seats per team.
          </p>
        </div>
      </div>

      {/* Plan summary */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Current plan</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{planName}</p>
          <p className="mt-1 text-sm text-slate-600">{subscription?.status ?? "Trial"}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Seats used</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{seatUsed} / {seatLimit}</p>
          <p className="mt-1 text-sm text-slate-600">{seatsRemaining} remaining</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Roles</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{Object.keys(byRole).length}</p>
          <p className="mt-1 text-sm text-slate-600 capitalize">{Object.keys(byRole).join(", ") || "—"}</p>
        </div>
      </div>

      {/* Members table */}
      {members.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-100 overflow-x-auto">
          <div className="min-w-[400px]">
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            <span>Member</span>
            <span>Role</span>
            <span>Status</span>
          </div>
          {members.map((member, idx) => {
            const roleKey = member.role?.toLowerCase() ?? "viewer";
            const displayName = member.full_name || member.email || "Unknown";
            const isActive = (member.status ?? "active") === "active";
            const joinedAt = member.created_at
              ? new Date(member.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
              : null;
            return (
              <div
                key={member.id ?? member.user_id ?? idx}
                className="grid grid-cols-[2fr_1fr_1fr] items-center gap-4 border-b border-slate-100 px-5 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{displayName}</p>
                  {member.email && member.full_name && (
                    <p className="text-xs text-slate-400">{member.email}</p>
                  )}
                  {joinedAt && <p className="text-xs text-slate-400">Joined {joinedAt}</p>}
                </div>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize w-fit",
                  ROLE_STYLES[roleKey] ?? ROLE_STYLES.viewer
                )}>
                  {roleKey}
                </span>
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold w-fit",
                  isActive ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-green-500" : "bg-yellow-500")} />
                  {isActive ? "Active" : "Pending"}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-8 text-center">
          <Users2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No team members yet</p>
          <p className="mt-1 text-xs text-slate-400">Invite members from the Access & Roles tab.</p>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <Lock className="h-4 w-4 text-slate-500" />
          {seatsRemaining > 0
            ? `${seatsRemaining} seat${seatsRemaining !== 1 ? "s" : ""} available on ${planName} plan.`
            : `All ${seatLimit} seats are in use. Upgrade to add more.`}
        </div>
      </div>
    </section>
  );
}
