import React from "react";
import {
  User,
  Building2,
  ShieldCheck,
  Bell,
  Plug,
  KeyRound,
  Search,
  LifeBuoy,
  UserCog,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  ProfileSection,
  AlertsNotificationsSection,
  WorkspaceSection,
  SecuritySection,
  PreferencesSection,
  IntegrationsHubSection,
} from "./SettingsSections";
import { Pill } from "./SettingsPrimitives";

// Accepts ?tab=… (case/spacing tolerant) so deep links route correctly.
function tabParamToSectionId(value?: string | null): SettingsSectionId | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase().replace(/[-_\s]+/g, "");
  if (v === "profile") return "Profile";
  if (v === "workspace" || v === "team" || v === "members" || v === "access" || v === "roles" || v === "organization" || v === "org") return "Workspace";
  if (v === "security" || v === "auth" || v === "password") return "Security";
  if (v === "notifications" || v === "alerts") return "Notifications";
  if (v === "integrations" || v === "emailaccounts" || v === "email" || v === "inbox" || v === "integration") return "Integrations";
  if (v === "preferences" || v === "prefs" || v === "timezone" || v === "signature") return "Preferences";
  return null;
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

type ProfileData = {
  name?: string;
  email?: string;
  title?: string;
  phone?: string;
  location?: string;
  bio?: string;
  timezone?: string;
  avatar_url?: string;
  planName?: string;
  plan?: string;
  planStatus?: string;
  isAdmin?: boolean;
};

type OrgProfileData = {
  id?: string;
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

type PreferencesData = {
  email_signature?: string;
  preferences?: Record<string, any>;
};

type SubscriptionData = {
  plan_code?: string;
  status?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  seat_limit?: number;
  stripe_customer_id?: string;
};

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

type TokenUsage = {
  feature: string;
  tokens_used: number;
};

type Integration = {
  id: string;
  integration_type?: string;
  type?: string;
  created_at: string;
};

type PlanData = {
  plan_code: string;
  display_name?: string;
  price_monthly?: number;
  price_yearly?: number;
  features?: string[] | Record<string, any>;
  seat_limit?: number;
};

type WorkspaceChip = {
  name?: string;
  planLabel?: string;
  roleLabel?: string;
  joinedLabel?: string;
};

export type SettingsLayoutProps = {
  profile?: ProfileData;
  orgProfile?: OrgProfileData;
  preferences?: PreferencesData;
  subscription?: SubscriptionData;
  plans?: PlanData[];
  members?: OrgMember[];
  invites?: OrgInvite[];
  apiKeys?: ApiKey[];
  auditLog?: AuditEvent[];
  tokenUsage?: TokenUsage[];
  integrations?: Integration[];
  workspace?: WorkspaceChip;
  isAdmin?: boolean;
  canAccess?: (minPlan: string) => boolean;
  onSaveProfile?: (data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onUploadAvatar?: (file: File) => Promise<{ error?: string } | void>;
  onSaveOrgProfile?: (data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onSaveEmailSignature?: (sig: string) => Promise<{ error?: string } | void>;
  onUploadLogo?: (file: File) => Promise<{ error?: string } | void>;
  onSavePreferences?: (section: string, data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onInviteMember?: (email: string, role: string) => Promise<{ error?: string } | void>;
  onRevokeMember?: (memberId: string) => Promise<{ error?: string } | void>;
  onUpdateMemberRole?: (memberId: string, role: string) => Promise<{ error?: string } | void>;
  onRevokeInvite?: (inviteId: string) => Promise<{ error?: string } | void>;
  onGenerateApiKey?: (keyName: string) => Promise<string | null>;
  onRevokeApiKey?: (keyId: string) => Promise<void>;
  onDisconnectIntegration?: (id: string) => Promise<void>;
  isPartner?: boolean;
  authProvider?: string | null;
};

// ── Nav group structure ───────────────────────────────────────────────────────
type NavGroup = {
  label: string;
  items: SettingsSectionId[];
};

const NAV_GROUPS: NavGroup[] = [
  { label: "Account",   items: ["Profile", "Security", "Notifications"] },
  { label: "Workspace", items: ["Workspace"] },
  { label: "Outreach",  items: ["Integrations"] },
  { label: "Personal",  items: ["Preferences"] },
];

const SECTION_ICON: Record<SettingsSectionId, React.ComponentType<{ className?: string; size?: number }>> = {
  Profile:       User,
  Workspace:     Building2,
  Security:      ShieldCheck,
  Notifications: Bell,
  Integrations:  Plug,
  Preferences:   KeyRound,
};

const SECTION_TITLE: Record<SettingsSectionId, string> = {
  Profile:       "Profile",
  Workspace:     "Workspace",
  Security:      "Security",
  Notifications: "Notifications",
  Integrations:  "Integrations",
  Preferences:   "Preferences",
};

const SECTION_DESCRIPTION: Partial<Record<SettingsSectionId, string>> = {
  Profile:
    "Your personal identity across Logistic Intel. Displayed on your outbound sends, comments, and teammate mentions.",
  Workspace:
    "Your shared organization, role, and team membership.",
  Security:
    "Password and recent activity on your Logistic Intel account.",
  Notifications:
    "Route the signals you care about to email, in-app, or Slack. Everything else stays quiet.",
  Integrations:
    "Connect your inboxes and data sources. Inbox connections power the Outbound Engine.",
  Preferences:
    "Personal defaults for time, email signature, and search.",
};

const SECTION_KICKER: Record<SettingsSectionId, string> = {
  Profile:       "ACCOUNT · SETTINGS",
  Workspace:     "WORKSPACE · SETTINGS",
  Security:      "ACCOUNT · SETTINGS",
  Notifications: "WORKSPACE · SETTINGS",
  Integrations:  "OUTREACH · SETTINGS",
  Preferences:   "ACCOUNT · SETTINGS",
};

function renderSection(
  section: SettingsSectionId,
  props: SettingsLayoutProps,
  navigate: (to: string) => void,
) {
  const messagingPrefs = props.preferences?.preferences?.messaging_preferences;
  const profileTimezone =
    props.profile?.timezone || props.preferences?.preferences?.profile_preferences?.timezone || "";

  switch (section) {
    case "Profile":
      return (
        <ProfileSection
          initialData={{ ...props.profile, timezone: profileTimezone }}
          messagingPrefs={messagingPrefs}
          onSave={props.onSaveProfile}
          onUploadAvatar={props.onUploadAvatar}
          onSaveMessagingPreferences={async (data) => {
            if (!props.onSavePreferences) return;
            return props.onSavePreferences("messaging_preferences", data);
          }}
          isAdmin={props.isAdmin}
        />
      );
    case "Workspace":
      return (
        <WorkspaceSection
          workspaceName={props.workspace?.name}
          workspaceRole={props.workspace?.roleLabel}
          joinedLabel={props.workspace?.joinedLabel}
          plan={props.subscription?.plan_code ?? props.profile?.plan ?? null}
          members={props.members}
          invites={props.invites}
          seatLimit={props.subscription?.seat_limit}
          onInvite={props.onInviteMember}
          onRevoke={props.onRevokeMember}
          onUpdateRole={props.onUpdateMemberRole}
          onRevokeInvite={props.onRevokeInvite}
          isAdmin={props.isAdmin}
          onUpgrade={() => navigate("/app/billing")}
        />
      );
    case "Security":
      return (
        <SecuritySection
          email={props.profile?.email}
          authProvider={props.authProvider}
          auditLog={props.auditLog}
        />
      );
    case "Notifications":
      return (
        <AlertsNotificationsSection
          preferences={props.preferences?.preferences?.alerts_notifications}
          onSavePreferences={(data: Record<string, unknown>) =>
            props.onSavePreferences?.("alerts_notifications", data)
          }
        />
      );
    case "Integrations":
      return (
        <IntegrationsHubSection
          integrations={props.integrations}
          onDisconnect={props.onDisconnectIntegration}
          isPartner={props.isPartner}
        />
      );
    case "Preferences":
      return (
        <PreferencesSection
          timezone={profileTimezone}
          emailSignature={props.preferences?.email_signature}
          onSaveTimezone={async (tz) => {
            if (!props.onSavePreferences) return;
            const existing = props.preferences?.preferences?.profile_preferences ?? {};
            return props.onSavePreferences("profile_preferences", { ...existing, timezone: tz });
          }}
          onSaveEmailSignature={props.onSaveEmailSignature}
        />
      );
    default:
      return (
        <ProfileSection
          initialData={{ ...props.profile, timezone: profileTimezone }}
          messagingPrefs={messagingPrefs}
          onSave={props.onSaveProfile}
          onUploadAvatar={props.onUploadAvatar}
          onSaveMessagingPreferences={async (data) => {
            if (!props.onSavePreferences) return;
            return props.onSavePreferences("messaging_preferences", data);
          }}
          isAdmin={props.isAdmin}
        />
      );
  }
}

// ── Left-rail nav ─────────────────────────────────────────────────────────────
function SettingsNav({
  activeSection,
  onSelect,
  searchQuery,
}: {
  activeSection: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  searchQuery: string;
}) {
  const query = searchQuery.trim().toLowerCase();

  return (
    <nav className="flex flex-col gap-0">
      {NAV_GROUPS.map((group) => {
        // Filter items by search
        const visibleItems = query
          ? group.items.filter((id) =>
              SECTION_TITLE[id].toLowerCase().includes(query) ||
              (SECTION_DESCRIPTION[id] || "").toLowerCase().includes(query),
            )
          : group.items;

        if (visibleItems.length === 0) return null;

        return (
          <div key={group.label}>
            <p className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 px-3 pb-1 pt-3">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {visibleItems.map((id) => {
                const Icon = SECTION_ICON[id];
                const isActive = id === activeSection;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelect(id)}
                    className={[
                      "flex w-full items-center gap-2.5 rounded-md py-2 text-left font-display text-[13px] transition",
                      isActive
                        ? "bg-blue-50 text-blue-700 pl-[calc(0.625rem-2px)] pr-2.5 border-l-2 border-blue-500"
                        : "text-slate-700 hover:bg-slate-50 px-2.5",
                    ].join(" ")}
                  >
                    <Icon
                      size={14}
                      className={isActive ? "text-blue-500 shrink-0" : "text-slate-500 shrink-0"}
                    />
                    {SECTION_TITLE[id]}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ── Full left rail (search + nav + help) ──────────────────────────────────────
function LeftRail({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}) {
  const [query, setQuery] = React.useState("");

  return (
    <aside className="flex w-[252px] shrink-0 flex-col bg-[#FAFBFC] border-r border-slate-200 min-h-full">
      {/* Search box */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 font-body text-[12.5px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <SettingsNav
          activeSection={activeSection}
          onSelect={onSelect}
          searchQuery={query}
        />
      </div>

      {/* Help footer */}
      <div className="border-t border-slate-100 px-4 py-3.5 flex items-center gap-2.5 shrink-0">
        <LifeBuoy size={14} className="text-slate-500 shrink-0" />
        <div className="min-w-0">
          <div className="font-display text-[12px] font-semibold text-slate-700">Need help?</div>
          <a
            href="https://docs.logisticintel.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-[11.5px] text-blue-500 hover:underline"
          >
            docs.logisticintel.com
          </a>
        </div>
      </div>
    </aside>
  );
}

// ── Horizontal strip nav (≤1100px) ───────────────────────────────────────────
function HorizontalStrip({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}) {
  return (
    <div className="flex overflow-x-auto border-b border-slate-200 bg-white">
      {SETTINGS_SECTIONS.map((section) => {
        const isActive = section.id === activeSection;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            className={[
              "whitespace-nowrap border-b-2 px-4 py-3 font-display text-[13px] font-semibold transition shrink-0",
              isActive
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {section.title}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsLayout(props: SettingsLayoutProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = tabParamToSectionId(searchParams.get("tab")) ?? "Profile";
  const [activeSection, setActiveSection] = React.useState<SettingsSectionId>(initialTab);

  // Keep state in sync if the URL changes (e.g. sidebar nav while page is mounted).
  React.useEffect(() => {
    const fromUrl = tabParamToSectionId(searchParams.get("tab"));
    if (fromUrl && fromUrl !== activeSection) {
      setActiveSection(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSelectSection = React.useCallback(
    (id: SettingsSectionId) => {
      setActiveSection(id);
      const next = new URLSearchParams(searchParams);
      if (id === "Profile") {
        next.delete("tab");
      } else {
        next.set("tab", id.toLowerCase().replace(/\s+/g, "-"));
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const roleLabel = props.workspace?.roleLabel || (props.isAdmin ? "Admin" : "Member");
  const planLabel = props.workspace?.planLabel || props.subscription?.plan_code || props.profile?.planName || "Free Trial";

  return (
    <div className="flex w-full flex-col">
      {/* ── Full-width page header ───────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white px-8 py-5 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="font-display text-[22px] font-bold text-slate-900 tracking-[-0.02em]">
            Settings
          </h1>
          <p className="font-body text-[13px] text-slate-500 mt-1">
            Control center for your profile, workspace, integrations, and outreach.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill tone="blue" icon={<UserCog size={11} />}>
            {roleLabel}
          </Pill>
          <Pill tone="cyan" dot>
            {planLabel}
          </Pill>
        </div>
      </header>

      {/* ── Horizontal strip (≤1100px / lg breakpoint) ──────────────────── */}
      <div className="xl:hidden">
        <HorizontalStrip
          activeSection={activeSection}
          onSelect={handleSelectSection}
        />
      </div>

      {/* ── Two-pane layout ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail — hidden below xl */}
        <div className="hidden xl:flex">
          <LeftRail
            activeSection={activeSection}
            onSelect={handleSelectSection}
          />
        </div>

        {/* Scroll body */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-[1100px] mx-auto py-7 px-8 flex flex-col gap-5">
            {renderSection(activeSection, props, navigate)}
          </div>
        </main>
      </div>
    </div>
  );
}
