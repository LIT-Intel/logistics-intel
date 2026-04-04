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

type ProfileData = {
  name?: string;
  email?: string;
  title?: string;
  phone?: string;
  location?: string;
  bio?: string;
  avatar_url?: string;
  savedCount?: number;
  campaignCount?: number;
  rfpCount?: number;
  planName?: string;
};

type SubscriptionData = {
  plan_code?: string;
  status?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  seat_limit?: number;
};

export type SettingsLayoutProps = {
  profile?: ProfileData;
  subscription?: SubscriptionData;
  members?: OrgMember[];
  onSaveProfile?: (data: Partial<ProfileData>) => Promise<void>;
  onInviteMember?: () => void;
};

function buildKpiData(
  members: OrgMember[],
  subscription?: SubscriptionData,
) {
  const activeMemberCount = members.length || 0;
  const planName = subscription?.plan_code
    ? subscription.plan_code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Free Trial";
  const renewalText = subscription?.current_period_end
    ? `Renews ${new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "No active plan";

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
      value: "11",
      helper: "Eff. deliverability 99%",
      accent: "sky" as const,
    },
    {
      title: "Alerts",
      value: "5 live",
      helper: "2 muted",
      accent: "slate" as const,
    },
  ] as const;
}

function renderSection(
  section: SettingsSectionId,
  props: SettingsLayoutProps,
) {
  switch (section) {
    case "Profile":
      return (
        <ProfileSection
          initialData={props.profile}
          onSave={props.onSaveProfile}
        />
      );
    case "Company & Signature":
      return <CompanySignatureSection />;
    case "Email":
      return <EmailSection />;
    case "LinkedIn":
      return <LinkedInSection />;
    case "Access & Roles":
      return (
        <AccessRolesSection
          members={props.members}
          seatLimit={props.subscription?.seat_limit}
          onInvite={props.onInviteMember}
        />
      );
    case "Billing & Plans":
      return <BillingPlansSection />;
    case "RFP & Pipeline":
      return <RfpPipelineSection />;
    case "Campaign Preferences":
      return <CampaignPreferencesSection />;
    case "Alerts & Notifications":
      return <AlertsNotificationsSection />;
    case "Security & API":
      return <SecurityApiSection />;
    case "Workspace Credits":
      return <WorkspaceCreditsSection />;
    case "Team Subscriptions":
      return <TeamSubscriptionsSection />;
    default:
      return <ProfileSection initialData={props.profile} onSave={props.onSaveProfile} />;
  }
}

export default function SettingsLayout(props: SettingsLayoutProps) {
  const { members = [], subscription } = props;
  const [activeSection, setActiveSection] =
    React.useState<SettingsSectionId>("Profile");

  const kpiData = buildKpiData(members, subscription);

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
