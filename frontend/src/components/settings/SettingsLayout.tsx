import React from "react";
import { ChevronRight } from "lucide-react";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  ProfileSection,
  CompanySignatureSection,
  AccessRolesSection,
  BillingPlansSection,
  RfpPipelineSection,
  CampaignPreferencesSection,
  AlertsNotificationsSection,
  SecurityApiSection,
  IntegrationsSection,
  OutreachAccountsSection,
  AffiliateProgramSection,
} from "./SettingsSections";

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
};

// Map section → header kicker category, matching the LIT design PDF
// (Account / Workspace / Outreach / Growth).
const SECTION_KICKER: Record<SettingsSectionId, string> = {
  Profile: "Account · Settings",
  "Security & API": "Account · Settings",
  "Alerts & Notifications": "Account · Settings",
  Billing: "Account · Settings",
  "Access & Roles": "Workspace · Settings",
  Organization: "Workspace · Settings",
  Integrations: "Outreach · Settings",
  "Outreach Accounts": "Outreach · Settings",
  "Campaign Preferences": "Outreach · Settings",
  "RFP & Pipeline": "Outreach · Settings",
  "Affiliate Program": "Growth · Settings",
};

// Sentence-cased page H1 per PDF (tab labels stay title-cased via SETTINGS_SECTIONS).
const SECTION_TITLE: Record<SettingsSectionId, string> = {
  Profile: "Profile",
  "Security & API": "Security & API",
  "Alerts & Notifications": "Alerts & notifications",
  "Access & Roles": "Access & roles",
  Integrations: "Integrations",
  "Outreach Accounts": "Outreach accounts",
  "Campaign Preferences": "Campaign preferences",
  "RFP & Pipeline": "RFP & pipeline",
  "Affiliate Program": "Affiliate program",
  Organization: "Organization",
  Billing: "Billing",
};

const SECTION_DESCRIPTION: Partial<Record<SettingsSectionId, string>> = {
  Profile:
    "Your personal identity across Logistic Intel. Displayed on your outbound sends, comments, and teammate mentions.",
  "Security & API": "Password, two-factor, active sessions, and developer API keys.",
  "Alerts & Notifications":
    "Route the signals you care about to email, in-app, or Slack. Everything else stays quiet.",
  "Access & Roles":
    "Teammates, pending invites, and the permissions each role carries across the workspace.",
  Integrations:
    "Connect your inboxes, enrichment providers, and data sources. Inbox connections power the Outbound Engine.",
  "Outreach Accounts":
    "Sender identity, inbox configuration, and sending eligibility. What Outbound Engine reads when launching a campaign.",
  "Campaign Preferences":
    "Defaults that the Outbound Engine uses when you spin up a new campaign.",
  "RFP & Pipeline": "How Command Center and Deal Builder behave for you by default.",
  "Affiliate Program": "Your referral link, earnings, and referred workspaces.",
  Organization: "Workspace branding, domain, and shared defaults.",
  Billing: "Plan, payment method, invoices, and renewal schedule.",
};

function WorkspaceChipBlock({ workspace }: { workspace?: WorkspaceChip }) {
  const name = workspace?.name || "LIT · Logistics Intelligence";
  const meta = [workspace?.planLabel, workspace?.roleLabel, workspace?.joinedLabel]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white shadow-sm">
        L
      </div>
      <div className="min-w-0 md:text-right">
        <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
        {meta ? (
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function renderSection(section: SettingsSectionId, props: SettingsLayoutProps) {
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
    case "Security & API":
      return (
        <SecurityApiSection
          apiKeys={props.apiKeys}
          auditLog={props.auditLog}
          onGenerateKey={props.onGenerateApiKey}
          onRevokeKey={props.onRevokeApiKey}
        />
      );
    case "Alerts & Notifications":
      return (
        <AlertsNotificationsSection
          preferences={props.preferences?.preferences?.alerts_notifications}
          onSavePreferences={(data: Record<string, unknown>) =>
            props.onSavePreferences?.("alerts_notifications", data)
          }
        />
      );
    case "Access & Roles":
      return (
        <AccessRolesSection
          members={props.members}
          invites={props.invites}
          seatLimit={props.subscription?.seat_limit}
          onInvite={props.onInviteMember}
          onRevoke={props.onRevokeMember}
          onUpdateRole={props.onUpdateMemberRole}
          onRevokeInvite={props.onRevokeInvite}
          isAdmin={props.isAdmin}
        />
      );
    case "Integrations":
      return (
        <IntegrationsSection
          integrations={props.integrations}
          onDisconnect={props.onDisconnectIntegration}
        />
      );
    case "Outreach Accounts":
      return (
        <OutreachAccountsSection
          emailSignature={props.preferences?.email_signature}
          onSaveSignature={async (sig: string) => {
            await props.onSaveEmailSignature?.(sig);
          }}
        />
      );
    case "Campaign Preferences":
      return (
        <CampaignPreferencesSection
          preferences={props.preferences?.preferences?.campaign_preferences}
          onSavePreferences={(data: Record<string, unknown>) =>
            props.onSavePreferences?.("campaign_preferences", data)
          }
        />
      );
    case "RFP & Pipeline":
      return (
        <RfpPipelineSection
          preferences={props.preferences?.preferences?.rfp_pipeline}
          onSavePreferences={(data: Record<string, unknown>) =>
            props.onSavePreferences?.("rfp_pipeline", data)
          }
        />
      );
    case "Affiliate Program":
      return <AffiliateProgramSection />;
    case "Organization":
      return (
        <CompanySignatureSection
          orgProfile={props.orgProfile}
          emailSignature={props.preferences?.email_signature}
          onSaveOrg={props.onSaveOrgProfile}
          onSaveSignature={props.onSaveEmailSignature}
          onUploadLogo={props.onUploadLogo}
        />
      );
    case "Billing":
      return (
        <BillingPlansSection
          subscription={props.subscription}
          plans={props.plans}
          isAdmin={props.isAdmin}
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

export default function SettingsLayout(props: SettingsLayoutProps) {
  const [activeSection, setActiveSection] = React.useState<SettingsSectionId>("Profile");

  const kicker = SECTION_KICKER[activeSection] || "Account · Settings";
  const title = SECTION_TITLE[activeSection] || activeSection;
  const description = SECTION_DESCRIPTION[activeSection];

  return (
    <div className="flex w-full flex-col">
      {/* Page header: kicker + title on left, workspace chip on right */}
      <header className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-600">
            {kicker}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
        </div>
        <WorkspaceChipBlock workspace={props.workspace} />
      </header>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 px-1 pb-3 text-sm">
        <span className="text-slate-400">Settings</span>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="font-medium text-slate-900">{title}</span>
      </nav>

      {/* Horizontal tab bar */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:-mx-6 md:px-6 xl:-mx-8 xl:px-8">
        <div className="-mb-px flex gap-0 overflow-x-auto">
          {SETTINGS_SECTIONS.map((section) => {
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={
                  "whitespace-nowrap border-b-2 px-4 py-3.5 text-sm transition " +
                  (isActive
                    ? "border-slate-900 font-medium text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700")
                }
              >
                {section.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section header: sentence-case H2 + description */}
      <main className="mx-auto w-full max-w-5xl pt-6">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {renderSection(activeSection, props)}
      </main>
    </div>
  );
}
