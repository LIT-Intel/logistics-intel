// SettingsLayout.tsx — Admin Control Panel re-skin.
//
// Shell: top bar (logo + settings search + actions), grouped settings
// sidebar with status badges, content area. Mobile: the sidebar becomes
// a slide-in drawer toggled by a hamburger button (44px touch targets,
// safe-area padding). Apple-HIG-informed: 8pt spacing grid, 10–16px radii,
// soft layered shadows, restrained indigo/blue accent, Lucide iconography.
//
// PRESERVED (do not change without care):
// - SettingsSectionId values, platformAdminOnly gating, ?tab= deep links
// - All SettingsLayoutProps (additive-only changes)
// - renderSection wiring + prop names passed to every section component
import React from "react";
import "./SettingsLayout.css";
import {
  User,
  Building,
  Building2,
  ShieldCheck,
  Bell,
  Plug,
  KeyRound,
  Search,
  LifeBuoy,
  Coins,
  UserMinus,
  Menu,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  ProfileSection,
  AlertsNotificationsSection,
  WorkspaceSection,
  BillingSection,
  SecuritySection,
  PreferencesSection,
  IntegrationsHubSection,
} from "./SettingsSections";
import { SBadge } from "./SettingsPrimitives";
import SettingsAccountSnapshot from "./SettingsAccountSnapshot";
import CompaniesSection from "./CompaniesSection";
import OrgExitRulesPanel from "@/features/outbound/components/OrgExitRulesPanel";
import OrgEnrichmentSettingsPanel from "@/features/settings/components/OrgEnrichmentSettingsPanel";

// Accepts ?tab=… (case/spacing tolerant) so deep links route correctly.
function tabParamToSectionId(value?: string | null): SettingsSectionId | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase().replace(/[-_\s]+/g, "");
  if (v === "profile") return "Profile";
  if (v === "workspace" || v === "team" || v === "members" || v === "access" || v === "roles" || v === "organization" || v === "org") return "Workspace";
  if (v === "billing" || v === "plan" || v === "subscription" || v === "invoice" || v === "invoices" || v === "payment") return "Billing";
  if (v === "security" || v === "auth" || v === "password" || v === "securityapi") return "Security";
  if (v === "notifications" || v === "alerts") return "Notifications";
  if (v === "integrations" || v === "emailaccounts" || v === "email" || v === "inbox" || v === "integration") return "Integrations";
  if (v === "exitrules" || v === "exit" || v === "sequenceexit" || v === "outreachexit") return "ExitRules";
  if (v === "enrichmentproviders" || v === "enrichment" || v === "providers" || v === "enrich") return "EnrichmentProviders";
  if (v === "companies" || v === "company" || v === "orgs" || v === "demoaccounts" || v === "demo") return "Companies";
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
  emailVerified?: boolean;
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
  /** Platform super-admin flag (NOT org owner/admin). Gates the platform-level
   *  settings tabs — Exit Rules, Enrichment Providers, Companies — so org
   *  users and end users don't see them. */
  isPlatformAdmin?: boolean;
  canAccess?: (minPlan: string) => boolean;
  onSaveProfile?: (data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onUploadAvatar?: (file: File) => Promise<{ error?: string } | void>;
  onSaveOrgProfile?: (data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onSaveEmailSignature?: (sig: string) => Promise<{ error?: string } | void>;
  onUploadLogo?: (file: File) => Promise<{ error?: string } | void>;
  onSavePreferences?: (section: string, data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onInviteMember?: (email: string, role: string) => Promise<{ error?: string } | void>;
  /** organizations.saved_sharing_enabled — workspace "Account sharing" toggle. */
  sharingEnabled?: boolean;
  onToggleSharing?: (enabled: boolean) => Promise<{ error?: string } | void>;
  onRevokeMember?: (memberId: string) => Promise<{ error?: string } | void>;
  onUpdateMemberRole?: (memberId: string, role: string) => Promise<{ error?: string } | void>;
  onRevokeInvite?: (inviteId: string) => Promise<{ error?: string } | void>;
  onGenerateApiKey?: (keyName: string) => Promise<string | null>;
  onRevokeApiKey?: (keyId: string) => Promise<void>;
  onDisconnectIntegration?: (id: string) => Promise<void>;
  isPartner?: boolean;
  authProvider?: string | null;
  orgId?: string | null;
};

// ── Nav groups (mirrors the Admin Control Panel design) ───────────────────────
type NavItem = {
  id: SettingsSectionId;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
  /** Platform-super-admin-only. Hidden from org owners + regular users. */
  platformAdminOnly?: boolean;
  /** Rendered at the right edge of the nav row (status pill / count). */
  badge?: React.ReactNode;
};

const NAV_GROUPS: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Account",
    items: [
      { id: "Profile",       label: "Profile",       Icon: User },
      { id: "Security",      label: "Security & API", Icon: ShieldCheck,
        badge: <SBadge tone="amber">2FA off</SBadge> },
      { id: "Notifications", label: "Notifications", Icon: Bell },
    ],
  },
  {
    group: "Workspace",
    items: [
      { id: "Workspace", label: "Workspace & team", Icon: Building2 },
      { id: "Billing",   label: "Billing",          Icon: Coins },
      // Platform-super-admin-only — manual company + user provisioning
      // (demo accounts). Gated server-side AND in the nav filter below.
      { id: "Companies", label: "Companies",        Icon: Building, platformAdminOnly: true },
    ],
  },
  {
    group: "Outreach",
    items: [
      { id: "Integrations",        label: "Integrations",         Icon: Plug },
      // Platform-super-admin-only — gated server-side AND in the nav filter below.
      { id: "ExitRules",           label: "Exit Rules",           Icon: UserMinus, platformAdminOnly: true },
      { id: "EnrichmentProviders", label: "Enrichment Providers", Icon: Plug,      platformAdminOnly: true },
    ],
  },
  {
    group: "Personal",
    items: [
      { id: "Preferences", label: "Preferences", Icon: KeyRound },
    ],
  },
];

// ── Top bar ──────────────────────────────────────────────────────────────────
function SettingsTopBar({
  onMenu,
  search,
  onSearch,
  onGoNotifications,
  roleLabel,
  planLabel,
  planTone,
}: {
  onMenu: () => void;
  search: string;
  onSearch: (q: string) => void;
  onGoNotifications: () => void;
  roleLabel: string;
  planLabel: string;
  planTone: "slate" | "blue" | "violet" | "cyan";
}) {
  return (
    <div className="lit-settings-topbar">
      <button
        type="button"
        className="lit-settings-hamburger"
        onClick={onMenu}
        aria-label="Open settings navigation"
      >
        <Menu size={20} />
      </button>
      <div className="lit-settings-brand">
        <span className="lit-settings-logo">LI</span>
        <span className="lit-settings-wordmark">LogisticIntel</span>
      </div>
      <div className="lit-settings-topsearch">
        <Search size={14} className="lit-settings-topsearch-icon" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search settings…"
          aria-label="Search settings"
        />
      </div>
      <div className="lit-settings-topbar-right">
        <span className="lit-settings-topbar-badges">
          <SBadge tone="blue">{roleLabel}</SBadge>
          <SBadge tone={planTone} dot>{planLabel} plan</SBadge>
        </span>
        <button
          type="button"
          className="lit-settings-iconbtn"
          onClick={onGoNotifications}
          aria-label="Notifications settings"
          title="Notifications"
        >
          <Bell size={17} />
        </button>
      </div>
    </div>
  );
}

// ── SettingsNav ──────────────────────────────────────────────────────────────
function SettingsNav({
  active,
  onNav,
  isPlatformAdmin,
  workspaceBadge,
  integrationsBadge,
  query,
}: {
  active: SettingsSectionId;
  onNav: (id: SettingsSectionId) => void;
  isPlatformAdmin: boolean;
  workspaceBadge?: React.ReactNode;
  integrationsBadge?: React.ReactNode;
  query: string;
}) {
  const q = query.trim().toLowerCase();
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items
      // Platform-admin-only items are filtered out for non-platform-admins.
      // This is a UX gate, NOT the security gate — the security gate is
      // server-side (RLS + admin-api platform_admins check).
      .filter((it) => !it.platformAdminOnly || isPlatformAdmin)
      .filter((it) => !q || it.label.toLowerCase().includes(q))
      .map((it) => {
        if (it.id === "Workspace" && workspaceBadge) return { ...it, badge: workspaceBadge };
        if (it.id === "Integrations" && integrationsBadge) return { ...it, badge: integrationsBadge };
        return it;
      }),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="lit-settings-nav" aria-label="Settings navigation">
      <nav className="lit-settings-nav-groups">
        {groups.map((g) => (
          <div key={g.group} className="lit-settings-nav-group">
            <div className="lit-settings-nav-group-label">{g.group}</div>
            <div className="lit-settings-nav-items">
              {g.items.map((it) => {
                const isActive = active === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onNav(it.id)}
                    className={`lit-settings-nav-item${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <it.Icon size={16} className="lit-settings-nav-icon" />
                    <span className="lit-settings-nav-label">{it.label}</span>
                    {it.badge && <span className="lit-settings-nav-badge">{it.badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="lit-settings-nav-help">
        <LifeBuoy size={15} className="lit-settings-nav-help-icon" />
        <div className="lit-settings-nav-help-text">
          <div className="lit-settings-nav-help-title">Need help?</div>
          <a
            href="https://docs.logisticintel.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            docs.logisticintel.com
          </a>
        </div>
      </div>
    </aside>
  );
}

// ── ForbiddenSection — fallback when a non-platform-admin reaches a
//    super-admin-only tab via direct URL (?tab=…). The nav already hides
//    these, but a stale bookmark could land here.
function ForbiddenSection({ sectionName }: { sectionName: string }) {
  return (
    <div className="lit-settings-forbidden">
      <h2>{sectionName} is restricted</h2>
      <p>
        This page is only available to platform administrators. Contact your
        Logistic Intel account team if you believe you should have access.
      </p>
    </div>
  );
}

// ── renderSection ────────────────────────────────────────────────────────────
function renderSection(
  section: SettingsSectionId,
  props: SettingsLayoutProps,
  navigate: (to: string) => void,
  onOpenSecurity: () => void,
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
          onOpenSecurity={onOpenSecurity}
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
          sharingEnabled={props.sharingEnabled}
          onToggleSharing={props.onToggleSharing}
        />
      );
    case "Billing":
      return (
        <BillingSection
          email={props.profile?.email}
          subscription={props.subscription}
          isAdmin={props.isAdmin}
          onCompare={() => navigate("/app/billing")}
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
    case "Companies":
      // Platform-super-admin gate. Defense-in-depth alongside the nav filter
      // and the server-side platform_admins check in admin-api.
      if (!props.isPlatformAdmin) return <ForbiddenSection sectionName="Companies" />;
      return <CompaniesSection />;
    case "ExitRules":
      // Platform-super-admin gate. Defense-in-depth alongside the nav filter
      // and the server-side RLS on lit_org_exit_settings.
      if (!props.isPlatformAdmin) return <ForbiddenSection sectionName="Exit Rules" />;
      return (
        <OrgExitRulesPanel
          orgId={props.orgId ?? null}
          canWrite={Boolean(props.isAdmin)}
        />
      );
    case "EnrichmentProviders":
      if (!props.isPlatformAdmin) return <ForbiddenSection sectionName="Enrichment Providers" />;
      return (
        <OrgEnrichmentSettingsPanel
          orgId={props.orgId ?? null}
          canWrite={Boolean(props.isAdmin)}
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
          onOpenSecurity={onOpenSecurity}
          onSaveMessagingPreferences={async (data) => {
            if (!props.onSavePreferences) return;
            return props.onSavePreferences("messaging_preferences", data);
          }}
          isAdmin={props.isAdmin}
        />
      );
  }
}

// ── SettingsLayout (default export) ──────────────────────────────────────────
export default function SettingsLayout(props: SettingsLayoutProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = tabParamToSectionId(searchParams.get("tab")) ?? "Profile";
  const [activeSection, setActiveSection] = React.useState<SettingsSectionId>(initialTab);
  const [search, setSearch] = React.useState("");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  // useTransition lets the nav button visually commit immediately while
  // the heavy section subtree renders at low priority (keeps INP low on
  // section switches).
  const [, startNav] = React.useTransition();

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
      // URL update + state set are both deferred via startNav so the
      // pressed/active visual feedback paints first.
      startNav(() => {
        setActiveSection(id);
        const next = new URLSearchParams(searchParams);
        if (id === "Profile") {
          next.delete("tab");
        } else {
          next.set("tab", id.toLowerCase().replace(/\s+/g, "-"));
        }
        setSearchParams(next, { replace: true });
      });
      setDrawerOpen(false);
    },
    [searchParams, setSearchParams],
  );

  const handleOpenSecurity = React.useCallback(() => {
    handleSelectSection("Security");
  }, [handleSelectSection]);

  const roleLabel = props.workspace?.roleLabel || (props.isAdmin ? "admin" : "member");
  const plan = props.subscription?.plan_code || props.profile?.plan || props.workspace?.planLabel || "free_trial";
  const planLabel =
    ({ free: "Free", growth: "Growth", scale: "Scale", enterprise: "Enterprise", free_trial: "Free Trial", starter: "Starter" } as Record<string, string>)[plan] || plan || "Free Trial";
  const planTone = (plan === "enterprise" ? "violet" : plan === "free" || plan === "free_trial" || plan === "starter" ? "slate" : "cyan") as "slate" | "blue" | "violet" | "cyan";
  const roleBadgeLabel = ({ admin: "Admin", manager: "Manager", member: "Member", viewer: "Viewer", owner: "Owner" } as Record<string, string>)[roleLabel] || roleLabel || "Member";

  const memberCount = props.members?.length ?? 0;
  const integrationsCount = props.integrations?.length ?? 0;

  return (
    <div className={`lit-settings-shell${drawerOpen ? " drawer-open" : ""}`}>
      <SettingsTopBar
        onMenu={() => setDrawerOpen(true)}
        search={search}
        onSearch={setSearch}
        onGoNotifications={() => handleSelectSection("Notifications")}
        roleLabel={roleBadgeLabel}
        planLabel={planLabel}
        planTone={planTone}
      />
      <div className="lit-settings-body-row">
        <div
          className="lit-settings-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          aria-hidden={!drawerOpen}
        />
        <div className="lit-settings-nav-wrap">
          <div className="lit-settings-drawer-head">
            <span className="lit-settings-drawer-title">Settings</span>
            <button
              type="button"
              className="lit-settings-iconbtn"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close settings navigation"
            >
              <X size={18} />
            </button>
          </div>
          <SettingsNav
            active={activeSection}
            onNav={handleSelectSection}
            isPlatformAdmin={Boolean(props.isPlatformAdmin)}
            workspaceBadge={memberCount > 0 ? <SBadge tone="slate">{memberCount}</SBadge> : undefined}
            integrationsBadge={integrationsCount > 0 ? <SBadge tone="slate">{integrationsCount}</SBadge> : undefined}
            query={search}
          />
        </div>
        <div className="lit-settings-body" role="main">
          <div className="lit-settings-content">
            <SettingsAccountSnapshot
              seatsUsed={props.members?.length}
              seatsLimit={props.subscription?.seat_limit ?? null}
            />
            {renderSection(activeSection, props, navigate, handleOpenSecurity)}
          </div>
        </div>
      </div>
    </div>
  );
}
