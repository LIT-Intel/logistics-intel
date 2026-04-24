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
  avatar_url?: string;
  savedCount?: number;
  campaignsCount?: number;
  rfpsCount?: number;
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
  isAdmin?: boolean;
  canAccess?: (minPlan: string) => boolean;
  onSaveProfile?: (data: Record<string, unknown>) => Promise<{ error?: string } | void>;
  onUploadAvatar?: (file: File) => Promise<{ error?: string } | void>;
  onExportData?: () => Promise<{ error?: string } | void>;
  onDeleteAccount?: () => Promise<{ error?: string } | void>;
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

function renderSection(section: SettingsSectionId, props: SettingsLayoutProps) {
  switch (section) {
    case "Profile":
      return (
        <ProfileSection
          initialData={props.profile}
          onSave={props.onSaveProfile}
          onUploadAvatar={props.onUploadAvatar}
          onExportData={props.onExportData}
          onDeleteAccount={props.onDeleteAccount}
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
          initialData={props.profile}
          onSave={props.onSaveProfile}
          onUploadAvatar={props.onUploadAvatar}
          onExportData={props.onExportData}
          onDeleteAccount={props.onDeleteAccount}
          isAdmin={props.isAdmin}
        />
      );
  }
}

export default function SettingsLayout(props: SettingsLayoutProps) {
  const [activeSection, setActiveSection] = React.useState<SettingsSectionId>("Profile");

  return (
    <div className="flex w-full flex-col">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 px-1 pb-3 text-sm">
        <span className="text-slate-400">Settings</span>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="font-medium text-slate-900">{activeSection}</span>
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

      {/* Section content */}
      <main className="mx-auto w-full max-w-4xl pt-6">
        {renderSection(activeSection, props)}
      </main>
    </div>
  );
}
