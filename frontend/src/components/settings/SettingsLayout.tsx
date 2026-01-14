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

const KPI_DATA = [
  { title: "Active users", value: "34", helper: "8 pending invites", accent: "blue" },
  { title: "Plan", value: "Growth", helper: "Renews Apr 30", accent: "emerald" },
  { title: "Connected inboxes", value: "11", helper: "Eff. deliverability 99%", accent: "sky" },
  { title: "Alerts", value: "5 live", helper: "2 muted", accent: "slate" },
] as const;

function renderSection(section: SettingsSectionId) {
  switch (section) {
    case "Profile":
      return <ProfileSection />;
    case "Company & Signature":
      return <CompanySignatureSection />;
    case "Email":
      return <EmailSection />;
    case "LinkedIn":
      return <LinkedInSection />;
    case "Access & Roles":
      return <AccessRolesSection />;
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
      return <ProfileSection />;
  }
}

export default function SettingsLayout() {
  const [activeSection, setActiveSection] =
    React.useState<SettingsSectionId>("Profile");

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
            {KPI_DATA.map((kpi) => (
              <KpiCard
                key={kpi.title}
                title={kpi.title}
                value={kpi.value}
                helper={kpi.helper}
                accent={kpi.accent}
              />
            ))}
          </div>
          {renderSection(activeSection)}
        </main>
      </div>
  );
}
