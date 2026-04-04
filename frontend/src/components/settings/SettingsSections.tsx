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
} from "lucide-react";
import { KpiCard, Pill } from "./SettingsPrimitives";

const cardBase =
  "rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02]";

export const SETTINGS_SECTIONS = [
  "Profile",
  "Company & Signature",
  "Email",
  "LinkedIn",
  "Access & Roles",
  "Billing & Plans",
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
  onSave?: (data: Record<string, string>) => Promise<void>;
};

export function ProfileSection({ initialData, onSave }: ProfileSectionProps = {}) {
  const [profile, setProfile] = React.useState({
    name: initialData?.name || "Ava Patel",
    title: initialData?.title || "Head of Ocean Procurement",
    phone: initialData?.phone || "+1 (312) 555-1400",
    location: initialData?.location || "Chicago, IL",
    bio: initialData?.bio || "Owns North America ocean sourcing, carrier scorecards, and yearly bids.",
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const email = initialData?.email || "";
  const plan = initialData?.plan || "free_trial";
  const savedCount = initialData?.savedCount ?? 0;
  const campaignsCount = initialData?.campaignsCount ?? 0;
  const rfpsCount = initialData?.rfpsCount ?? 0;

  // Derive initials for avatar
  const initials = React.useMemo(() => {
    const src = (profile.name || email || "U").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }, [profile.name, email]);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const planLabel = plan === "free_trial" ? "Free Trial"
    : plan === "standard" ? "Standard"
    : plan === "growth" ? "Growth"
    : plan === "enterprise" ? "Enterprise"
    : plan;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-sm ring-1 ring-black/[0.02]">
      {/* Cover photo strip */}
      <div className="relative h-32 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600">
        <button
          type="button"
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-xs text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
        >
          <MapPin className="h-3 w-3" />
          Change cover
        </button>
      </div>

      <div className="px-6 pb-6">
        {/* Avatar row — overlaps cover */}
        <div className="flex items-end justify-between -mt-10 mb-4">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-2xl font-bold text-white ring-4 ring-white">
              {initials}
            </div>
            <button
              type="button"
              className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-700"
              title="Upload photo"
            >
              <Globe className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Active
            </span>
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
              {planLabel}
            </span>
          </div>
        </div>

        {/* Name + title */}
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{profile.name || "Your Name"}</h2>
          <p className="text-sm text-slate-500">{profile.title || "Add your title"}{profile.location ? ` · ${profile.location}` : ""}</p>
        </div>

        {/* Stats bar */}
        <div className="mt-5 grid grid-cols-3 gap-4 rounded-2xl border border-slate-100 bg-slate-50 py-4">
          <div className="text-center">
            <p className="text-2xl font-semibold text-slate-900">{savedCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 mt-0.5">Saved Companies</p>
          </div>
          <div className="border-x border-slate-200 text-center">
            <p className="text-2xl font-semibold text-slate-900">{campaignsCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 mt-0.5">Campaigns</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-slate-900">{rfpsCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 mt-0.5">RFPs</p>
          </div>
        </div>

        {/* Section header */}
        <div className="mt-6 mb-5">
          <Pill label="Personal Information" tone="primary" />
          <p className="mt-2 text-sm text-slate-600">
            Keep your LIT Search profile, signature, and contact details aligned with your team.
          </p>
        </div>

        {/* Form */}
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
                className={cn(inputClass, "bg-slate-50 cursor-not-allowed text-slate-400")}
                value={email}
                readOnly
              />
              <span className="mt-1 block text-xs text-slate-400">Managed by your auth provider</span>
            </label>
          )}
          <label className="md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              What should prospects know?
            </span>
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
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
          <button
            type="button"
            disabled={saving || !onSave}
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-md shadow-slate-900/20 transition hover:bg-slate-800 disabled:opacity-50 ml-auto"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function CompanySignatureSection() {
  const [preferences, setPreferences] = React.useState({
    company: "Spark Fusion Logistics",
    tagline: "Global freight, LIT Search powered.",
    website: "sparkfusion.co",
    signature:
      "Best,\nAva Patel\nSpark Fusion Logistics\nava.patel@sparkfusion.co",
  });

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
        <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
          B2B Logistics
        </div>
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Company name
          <input
            className={inputClass}
            value={preferences.company}
            onChange={(e) =>
              setPreferences((prev) => ({ ...prev, company: e.target.value }))
            }
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Tagline
          <input
            className={inputClass}
            value={preferences.tagline}
            onChange={(e) =>
              setPreferences((prev) => ({ ...prev, tagline: e.target.value }))
            }
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Website
          <input
            className={inputClass}
            value={preferences.website}
            onChange={(e) =>
              setPreferences((prev) => ({ ...prev, website: e.target.value }))
            }
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Email signature
          <textarea
            className={cn(inputClass, "min-h-[120px] resize-none")}
            value={preferences.signature}
            onChange={(e) =>
              setPreferences((prev) => ({ ...prev, signature: e.target.value }))
            }
          />
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
              {preferences.company.toUpperCase()}
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {preferences.tagline}
            </p>
            <p className="mt-1 text-sm text-slate-600">{preferences.website}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Signature preview
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-700">
            {preferences.signature}
          </pre>
        </div>
      </div>
    </section>
  );
}

export function EmailSection() {
  const [inboxes, setInboxes] = React.useState([
    { label: "ava@sparkfusion.co", status: "Connected", primary: true },
    { label: "logistics@sparkfusion.co", status: "Syncing", primary: false },
  ]);

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
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Mail className="h-4 w-4" />
          Add inbox
        </button>
      </div>
      <div className="mt-6 space-y-3">
        {inboxes.map((inbox) => (
          <div
            key={inbox.label}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {inbox.label}
              </p>
              <p className="text-xs text-slate-500">
                {inbox.primary
                  ? "Primary sending address"
                  : "Available for sequences"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                  inbox.status === "Connected"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700",
                )}
              >
                {inbox.status}
              </span>
              {!inbox.primary && (
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                  onClick={() =>
                    setInboxes((prev) =>
                      prev.map((item) => ({
                        ...item,
                        primary: item.label === inbox.label,
                      })),
                    )
                  }
                >
                  Make primary
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Deliverability
          </p>
          <p className="mt-2 text-sm text-slate-600">
            DKIM, SPF, and DMARC checks are passing for sparkfusion.co.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
            Sending window
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Campaigns deploy Mon–Fri, 7:30a – 6:30p in recipient’s local time.
          </p>
        </div>
      </div>
    </section>
  );
}

export function LinkedInSection() {
  const [automations, setAutomations] = React.useState({
    syncReplies: true,
    shareSignals: false,
    autoVisit: true,
  });

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
            “Intro + value” and “Ops pulse” active for retail shippers.
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
            “Curious advisor” voice with one CTA per thread.
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {[
          {
            key: "syncReplies",
            label: "Sync replies to Command Center timelines",
          },
          {
            key: "shareSignals",
            label: "Share engagement signals with salesforce team",
          },
          {
            key: "autoVisit",
            label: "Auto-visit profiles before a message is sent",
          },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/80 px-4 py-3"
          >
            <p className="text-sm font-semibold text-slate-800">
              {item.label}
            </p>
            <Toggle
              checked={automations[item.key as keyof typeof automations]}
              onChange={(value) =>
                setAutomations((prev) => ({
                  ...prev,
                  [item.key]: value,
                }))
              }
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

type AccessRolesSectionProps = {
  members?: OrgMember[];
  seatLimit?: number;
  onInvite?: () => void;
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

export function AccessRolesSection({ members, seatLimit, onInvite }: AccessRolesSectionProps = {}) {
  const team = members && members.length > 0 ? members : MOCK_MEMBERS;
  const seatUsed = team.length;
  const seatTotal = seatLimit ?? 10;
  const seatPct = Math.min(100, Math.round((seatUsed / seatTotal) * 100));

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Access & Roles" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Workspace permissions
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Control who can edit LIT Search cadences, billing, and saved
            shippers.
          </p>
        </div>
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Users2 className="h-4 w-4" />
          Invite teammate
        </button>
      </div>

      {/* Seat usage bar */}
      <div className="mt-5 flex items-center gap-3">
        <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2">
          <div
            className="h-2 rounded-full bg-slate-800 transition-all"
            style={{ width: `${seatPct}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          {seatUsed} / {seatTotal} seats used
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_80px] gap-4 border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
          <span>Member</span>
          <span>Role</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {team.map((member, idx) => {
          const roleKey = member.role?.toLowerCase() ?? "viewer";
          const roleStyle = ROLE_STYLES[roleKey] ?? ROLE_STYLES.viewer;
          const scope = SCOPE_LABELS[roleKey] ?? member.role;
          const displayName = member.full_name || member.email || member.user_id || "Unknown";
          const initials = getInitials(member.full_name, member.email);
          const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
          const isActive = (member.status ?? "active") === "active";

          return (
            <div
              key={member.id ?? member.user_id ?? idx}
              className="grid grid-cols-[2fr_1fr_1fr_80px] items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white flex-shrink-0", avatarColor)}>
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
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize w-fit", roleStyle)}>
                {roleKey}
              </span>
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold w-fit",
                isActive ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-green-500" : "bg-yellow-500")} />
                {isActive ? "Active" : "Pending"}
              </span>
              <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                Edit
              </button>
            </div>
          );
        })}
      </div>
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
            42 changes logged last 7 days (exports, plan updates, access edits).
          </p>
        </div>
      </div>
    </section>
  );
}

export function BillingPlansSection() {
  const plans = [
    {
      name: "Growth",
      price: "$4,500",
      cadence: "month",
      highlight: "Current plan",
      features: [
        "200 LIT Search credits",
        "8 Command Center seats",
        "Prospect enrichment",
      ],
    },
    {
      name: "Enterprise",
      price: "Custom",
      cadence: "",
      highlight: "Upgrade",
      features: ["Unlimited workspaces", "Dedicated CSM", "Private data lake"],
    },
  ];

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
          Generate invoice
        </button>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className="flex flex-col rounded-3xl border border-slate-100 bg-white/90 p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                  {plan.name}
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">
                  {plan.price}
                  {plan.cadence && (
                    <span className="text-base font-medium text-slate-500">
                      /{plan.cadence}
                    </span>
                  )}
                </p>
              </div>
              <Pill label={plan.highlight} tone="success" />
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={cn(
                "mt-5 rounded-full border px-4 py-2 text-sm font-semibold",
                plan.name === "Growth"
                  ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                  : "border-indigo-200 bg-indigo-600 text-white hover:bg-indigo-500",
              )}
            >
              {plan.name === "Growth" ? "Manage plan" : "Talk to sales"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RfpPipelineSection() {
  const stages = [
    { label: "Qualification", companies: 6, value: "$2.3M" },
    { label: "Pricing in progress", companies: 4, value: "$4.1M" },
    { label: "Executive review", companies: 2, value: "$1.9M" },
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
              <span className="text-base font-medium text-slate-500">
                {" "}
                companies
              </span>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Weighted pipeline {stage.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
          Next action
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <MapPin className="h-4 w-4 text-indigo-500" />
          Move “Atlas Outdoor” to executive review once KPIs finalize.
        </div>
      </div>
    </section>
  );
}

export function CampaignPreferencesSection() {
  const [settings, setSettings] = React.useState({
    autopilot: true,
    personalizedFirstLines: true,
    dropInCallouts: false,
    autoPause: true,
  });

  const toggles = [
    { key: "autopilot", label: "Auto-schedule new LIT Search cadences" },
    { key: "personalizedFirstLines", label: "Personalize first lines via AI" },
    { key: "dropInCallouts", label: "Add Command Center callouts" },
    { key: "autoPause", label: "Pause sequences when booked meetings sync" },
  ] as const;

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
            <p className="text-sm font-semibold text-slate-800">
              {toggle.label}
            </p>
            <Toggle
              checked={settings[toggle.key]}
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, [toggle.key]: value }))
              }
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
            “New volume alert” and “Lane reshuffle” snippets used 68 times last
            month.
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

export function AlertsNotificationsSection() {
  const [alerts, setAlerts] = React.useState({
    shipmentDrops: true,
    newSavedCompany: true,
    creditUsage: false,
    weeklyDigest: true,
  });

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Alerts & Notifications" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Signal routing
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Decide which insights from LIT Search get piped to email, Slack, or
            SMS.
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
        {[
          {
            key: "shipmentDrops",
            title: "Shipment drops",
            body: "Alert when a saved shipper’s volume falls >15% MoM.",
          },
          {
            key: "newSavedCompany",
            title: "New saved company",
            body: "Ping account teams when someone bookmarks from LIT Search.",
          },
          {
            key: "creditUsage",
            title: "Credit usage",
            body: "Warn RevOps when LIT Search credits exceed 80%.",
          },
          {
            key: "weeklyDigest",
            title: "Weekly digest",
            body: "Sunday recap of Command Center KPIs.",
          },
        ].map((alert) => (
          <div
            key={alert.key}
            className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
          >
            <div className="rounded-2xl bg-slate-900/5 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  {alert.title}
                </p>
                <Toggle
                  checked={alerts[alert.key as keyof typeof alerts]}
                  onChange={(value) =>
                    setAlerts((prev) => ({ ...prev, [alert.key]: value }))
                  }
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

export function SecurityApiSection() {
  const [security, setSecurity] = React.useState({
    mfa: true,
    deviceApprovals: true,
    rotateKeys: false,
  });

  const tokens = [
    { label: "Search automation", lastUsed: "2h ago" },
    { label: "Command Center export", lastUsed: "Yesterday" },
  ];

  return (
    <section className={cardBase}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Pill label="Security & API" tone="primary" />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            Protect workspace data
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Enforce MFA, rotate API keys, and lock down exports.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Shield className="h-4 w-4 text-emerald-500" />
          View audit log
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { key: "mfa", label: "Require MFA for all members" },
          { key: "deviceApprovals", label: "Approve new devices" },
          { key: "rotateKeys", label: "Rotate API keys every 90 days" },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/90 px-4 py-3 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-800">
              {item.label}
            </p>
            <Toggle
              checked={security[item.key as keyof typeof security]}
              onChange={(value) =>
                setSecurity((prev) => ({ ...prev, [item.key]: value }))
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
          <span>API token</span>
          <span>Last used</span>
        </div>
        {tokens.map((token) => (
          <div
            key={token.label}
            className="flex items-center justify-between border-b border-slate-100 px-5 py-4 text-sm last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <KeyRound className="h-4 w-4 text-indigo-500" />
              <span className="font-semibold text-slate-900">
                {token.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              {token.lastUsed}
              <button className="text-xs font-semibold text-indigo-600">
                Revoke
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WorkspaceCreditsSection() {
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
        <KpiCard
          title="LIT Search credits"
          value="640 / 1,000"
          helper="64% used"
          accent="indigo"
        />
        <KpiCard
          title="Enrichment credits"
          value="420 / 800"
          helper="52% used"
          accent="emerald"
        />
        <KpiCard
          title="Campaign sends"
          value="1,840 / 3,000"
          helper="Rolling 30d"
          accent="sky"
        />
        <KpiCard
          title="Command Center briefs"
          value="18 / 40"
          helper="This month"
          accent="slate"
        />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {[
          {
            label: "LIT Search",
            usage: 64,
            helper: "Avg 32 saved shippers / wk",
          },
          { label: "Enrichment", usage: 52, helper: "4,120 contacts enriched" },
          { label: "Campaigns", usage: 61, helper: "Send window 7:30a-6:30p" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
              <span>{item.label}</span>
              <span>{item.usage}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-slate-900"
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

export function TeamSubscriptionsSection() {
  const teams = [
    { name: "Sales pod", seats: "6 / 8", focus: "Retail + consumer" },
    { name: "Ops pod", seats: "4 / 6", focus: "Middle-mile programs" },
    { name: "RevOps", seats: "3 / 3", focus: "Billing + analytics" },
  ];

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
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Users2 className="h-4 w-4" />
          Adjust seats
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {teams.map((team) => (
          <div
            key={team.name}
            className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
              {team.name}
            </p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">
              {team.seats}
            </p>
            <p className="mt-1 text-sm text-slate-600">{team.focus}</p>
            <button className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">
              View members
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <Lock className="h-4 w-4 text-slate-500" />
          2 free viewer seats remain for partner access.
        </div>
      </div>
    </section>
  );
}
