// SettingsLayout.tsx — Shell lifted from design/Settings.html
// Inline style={{ }} approach. SettingsHeader + SettingsNav (left rail) with
// lucide-react icons. No second sidebar — LITPage already provides the app sidebar.
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
import { SBadge, sBtnPrimary } from "./SettingsPrimitives";

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

// ── Nav groups (matches the design's NAV array, curated for 6 sections) ───────
const NAV_GROUPS: Array<{
  group: string;
  items: Array<{ id: SettingsSectionId; label: string; Icon: React.ComponentType<{ size?: number; color?: string }> }>;
}> = [
  {
    group: "Account",
    items: [
      { id: "Profile",       label: "Profile",       Icon: User },
      { id: "Security",      label: "Security",      Icon: ShieldCheck },
      { id: "Notifications", label: "Notifications", Icon: Bell },
    ],
  },
  {
    group: "Workspace",
    items: [
      { id: "Workspace", label: "Workspace", Icon: Building2 },
    ],
  },
  {
    group: "Outreach",
    items: [
      { id: "Integrations", label: "Integrations", Icon: Plug },
    ],
  },
  {
    group: "Preferences",
    items: [
      { id: "Preferences", label: "Preferences", Icon: KeyRound },
    ],
  },
];

// ── SettingsHeader ─────────────────────────────────────────────────────────────
function SettingsHeader({ plan, role }: { plan: string; role: string }) {
  const roleLabel = ({ admin: "Admin", manager: "Manager", member: "Member", viewer: "Viewer" } as Record<string, string>)[role] || role || "Member";
  const planLabel = ({ free: "Free", growth: "Growth", scale: "Scale", enterprise: "Enterprise", free_trial: "Free Trial", starter: "Starter" } as Record<string, string>)[plan] || plan || "Free Trial";
  const planTone = plan === "enterprise" ? "violet" : plan === "free" || plan === "free_trial" || plan === "starter" ? "slate" : "cyan";

  return (
    <div
      className="lit-settings-header"
      style={{
        padding: "20px 32px 18px",
        borderBottom: "1px solid #E5E7EB",
        background: "#FFFFFF",
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{
          fontFamily: "Space Grotesk,sans-serif",
          fontSize: 22,
          fontWeight: 700,
          color: "#0F172A",
          letterSpacing: "-0.02em",
        }}>Settings</div>
        <div style={{
          fontFamily: "DM Sans,sans-serif",
          fontSize: 13,
          color: "#64748b",
          marginTop: 3,
        }}>Control center for your profile, workspace, integrations, and outreach.</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <SBadge tone="blue" icon={<UserCog size={11} />}>{roleLabel}</SBadge>
        <SBadge tone={planTone} dot>{planLabel} plan</SBadge>
      </div>
    </div>
  );
}

// ── SettingsNav ─────────────────────────────────────────────────────────────────
function SettingsNav({
  active,
  onNav,
  search,
  onSearch,
}: {
  active: SettingsSectionId;
  onNav: (id: SettingsSectionId) => void;
  search: string;
  onSearch: (q: string) => void;
}) {
  const query = search.trim().toLowerCase();

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: query
      ? g.items.filter((it) => it.label.toLowerCase().includes(query))
      : g.items,
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      className="lit-settings-nav"
      style={{
        width: 252,
        minWidth: 252,
        borderRight: "1px solid #E5E7EB",
        background: "#FAFBFC",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Search box */}
      <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ position: "relative" }}>
          <Search
            size={13}
            color="#94a3b8"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search settings…"
            style={{
              width: "100%",
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              padding: "7px 12px 7px 30px",
              fontSize: 12.5,
              fontFamily: "DM Sans,sans-serif",
              color: "#0F172A",
              outline: "none",
            }}
            onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)"; }}
            onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; e.target.style.boxShadow = "none"; }}
          />
        </div>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
        {visibleGroups.map((g) => (
          <div key={g.group} style={{ marginBottom: 14 }}>
            <div style={{
              fontFamily: "Space Grotesk,sans-serif",
              fontSize: 10,
              fontWeight: 600,
              color: "#94a3b8",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "6px 10px 4px",
            }}>{g.group}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {g.items.map((it) => {
                const isActive = active === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onNav(it.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 500,
                      fontFamily: "Space Grotesk,sans-serif",
                      background: isActive ? "#EFF6FF" : "transparent",
                      color: isActive ? "#1d4ed8" : "#334155",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      transition: "all 140ms",
                    }}
                  >
                    <it.Icon size={14} color={isActive ? "#3b82f6" : "#64748b"} />
                    <span>{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Help footer */}
      <div style={{
        padding: "14px 16px",
        borderTop: "1px solid #F1F5F9",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <LifeBuoy size={14} color="#64748b" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Space Grotesk,sans-serif", fontSize: 12, fontWeight: 600, color: "#0F172A" }}>
            Need help?
          </div>
          <a
            href="https://docs.logisticintel.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11.5, color: "#3b82f6", textDecoration: "none" }}
          >
            docs.logisticintel.com
          </a>
        </div>
      </div>
    </aside>
  );
}

// ── renderSection ──────────────────────────────────────────────────────────────
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
          plan={props.subscription?.plan_code ?? props.profile?.plan ?? null}
          apiKeys={props.apiKeys}
          onGenerateKey={props.onGenerateApiKey}
          onRevokeKey={props.onRevokeApiKey}
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

// ── SettingsLayout (default export) ───────────────────────────────────────────
export default function SettingsLayout(props: SettingsLayoutProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = tabParamToSectionId(searchParams.get("tab")) ?? "Profile";
  const [activeSection, setActiveSection] = React.useState<SettingsSectionId>(initialTab);
  const [search, setSearch] = React.useState("");

  // Keep state in sync if the URL changes.
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

  const roleLabel = props.workspace?.roleLabel || (props.isAdmin ? "admin" : "member");
  const planLabel =
    props.subscription?.plan_code ||
    props.profile?.plan ||
    props.workspace?.planLabel ||
    "free_trial";

  return (
    <div style={{ display: "flex", minHeight: "100%", background: "#020617" }}>
      <main
        className="lit-settings-main"
        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8FAFC", minWidth: 0 }}
      >
        <SettingsHeader plan={planLabel} role={roleLabel} />
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          <SettingsNav
            active={activeSection}
            onNav={handleSelectSection}
            search={search}
            onSearch={setSearch}
          />
          <div
            className="lit-settings-body"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "28px 32px 40px",
              position: "relative",
              minWidth: 0,
            }}
          >
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              {renderSection(activeSection, props, navigate)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
