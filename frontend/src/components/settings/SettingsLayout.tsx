import React from "react";
import SettingsSidebar from "./SettingsSidebar";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  ProfileSection,
  CompanySignatureSection,
  EmailSection,
  LinkedInSection,
  AccessRolesSection,
  BillingPlansSection,
  RfpPipelineSection,
  CampaignPreferencesSection,
  AlertsNotificationsSection,
  SecurityApiSection,
  WorkspaceCreditsSection,
  TeamSubscriptionsSection,
} from "./SettingsSections";
import { KpiCard, SettingsHeader } from "./SettingsPrimitives";

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
  isAdmin?: boolean;
};

type OrgProfileData = {
  id?: string;
  name?: string;
  tagline?: string;
  website?: string;
  industry?: string;
  size?: string;
  logo_url?: string;
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
  type: string;
  config?: Record<string, any>;
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
  onSaveProfile?: (data: Record<string, unknown>) => Promise<void>;
  onUploadAvatar?: (file: File) => Promise<void>;
  onSaveOrgProfile?: (data: Record<string, unknown>) => Promise<void>;
  onSaveEmailSignature?: (sig: string) => Promise<void>;
  onUploadLogo?: (file: File) => Promise<void>;
  onSavePreferences?: (section: string, data: Record<string, unknown>) => Promise<void>;
  onInviteMember?: (email: string, role: string) => Promise<void>;
  onRevokeMember?: (memberId: string) => Promise<void>;
  onUpdateMemberRole?: (memberId: string, role: string) => Promise<void>;
  onRevokeInvite?: (inviteId: string) => Promise<void>;
  onGenerateApiKey?: (keyName: string) => Promise<string | null>;
  onRevokeApiKey?: (keyId: string) => Promise<void>;
  onDisconnectIntegration?: (id: string) => Promise<void>;
};

function buildKpiData(
  members: OrgMember[],
  subscription?: SubscriptionData,
  integrations?: Integration[],
) {
  const activeMemberCount = members.length || 0;
  const planName = subscription?.plan_code
    ? subscription.plan_code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Free Trial";
  const renewalText = subscription?.current_period_end
    ? `Renews ${new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "No active plan";

  const connectedInboxes = (integrations ?? []).filter(
    (i) => i.type === "gmail" || i.type === "outlook"
  ).length;

  return [
    {
      title: "Active users",
      value: activeMemberCount > 0 ? String(activeMemberCount) : "—",
      helper: "workspace members",
      accent: "indigo" as const,
    },
    {
      title: "Plan",
      value: planName,
      helper: renewalText,
      accent: "emerald" as const,
    },
    {
      title: "Connected inboxes",
      value: connectedInboxes > 0 ? String(connectedInboxes) : "—",
      helper: connectedInboxes > 0 ? "Gmail / Outlook" : "No inboxes connected",
      accent: "sky" as const,
    },
    {
      title: "Plan status",
      value: subscription?.status === "active" ? "Active" : subscription?.status === "past_due" ? "Past due" : "Trial",
      helper: subscription?.cancel_at_period_end ? "Cancels at period end" : "Auto-renews",
      accent: "slate" as const,
    },
  ] as const;
}

function renderSection(section: SettingsSectionId, props: SettingsLayoutProps) {
  switch (section) {
    case "Profile":
      return (
        <ProfileSection
          initialData={props.profile}
          onSave={props.onSaveProfile}
          onUploadAvatar={props.onUploadAvatar}
          isAdmin={props.isAdmin}
        />
      );
    case "Company & Signature":
      return (
        <CompanySignatureSection
          orgProfile={props.orgProfile}
          emailSignature={props.preferences?.email_signature}
          onSaveOrg={props.onSaveOrgProfile}
          onSaveSignature={props.onSaveEmailSignature}
          onUploadLogo={props.onUploadLogo}
        />
      );
    case "Email":
      return (
        <EmailSection
          integrations={props.integrations}
          preferences={props.preferences?.preferences?.email}
          onSavePreferences={(data) => props.onSavePreferences?.("email", data)}
          onDisconnect={props.onDisconnectIntegration}
        />
      );
    case "LinkedIn":
      return (
        <LinkedInSection
          preferences={props.preferences?.preferences?.linkedin}
          onSavePreferences={(data) => props.onSavePreferences?.("linkedin", data)}
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
    case "Billing & Plans":
      return (
        <BillingPlansSection
          subscription={props.subscription}
          plans={props.plans}
          isAdmin={props.isAdmin}
        />
      );
    case "RFP & Pipeline":
      return (
        <RfpPipelineSection
          preferences={props.preferences?.preferences?.rfp}
          onSavePreferences={(data) => props.onSavePreferences?.("rfp", data)}
        />
      );
    case "Campaign Preferences":
      return (
        <CampaignPreferencesSection
          preferences={props.preferences?.preferences?.campaigns}
          onSavePreferences={(data) => props.onSavePreferences?.("campaigns", data)}
        />
      );
    case "Alerts & Notifications":
      return (
        <AlertsNotificationsSection
          preferences={props.preferences?.preferences?.notifications}
          onSavePreferences={(data) => props.onSavePreferences?.("notifications", data)}
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
    case "Workspace Credits":
      return (
        <WorkspaceCreditsSection
          tokenUsage={props.tokenUsage}
          subscription={props.subscription}
          isAdmin={props.isAdmin}
        />
      );
    case "Team Subscriptions":
      return (
        <TeamSubscriptionsSection
          members={props.members}
          subscription={props.subscription}
          isAdmin={props.isAdmin}
        />
      );
    default:
      return (
        <ProfileSection
          initialData={props.profile}
          onSave={props.onSaveProfile}
          onUploadAvatar={props.onUploadAvatar}
          isAdmin={props.isAdmin}
        />
      );
  }
}

export default function SettingsLayout(props: SettingsLayoutProps) {
  const { members = [], subscription, integrations } = props;
  const [activeSection, setActiveSection] = React.useState<SettingsSectionId>("Profile");

  const kpiData = buildKpiData(members, subscription, integrations);

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:gap-8">
      <SettingsSidebar
        sections={SETTINGS_SECTIONS}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
      />
      <main className="flex-1 space-y-6">
        <SettingsHeader
          title="Workspace controls"
          description="Adjust messaging defaults, workspace credits, security, and billing for LIT Search."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {kpiData.map((kpi) => (
            <KpiCard
              key={kpi.title}
              title={kpi.title}
              value={kpi.value}
              helper={kpi.helper}
              accent={kpi.accent}
            />
          ))}
        </div>
        {renderSection(activeSection, props)}
      </main>
    </div>
  );
}
