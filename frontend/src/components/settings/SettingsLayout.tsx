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
  { title: "Active users", value: "34", helper: "8 pending invites", accent: "indigo" },
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
    <div className="min-h-screen bg-slate-100/70 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 sm:flex-row sm:gap-6 lg:gap-8">
        <div className="sm:hidden">
          <label className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            Sections
          </label>
          <select
            value={activeSection}
            onChange={(event) =>
              setActiveSection(event.target.value as SettingsSectionId)
            }
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {SETTINGS_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden w-full max-w-xs shrink-0 sm:block">
          <SettingsSidebar
            sections={SETTINGS_SECTIONS}
            activeSection={activeSection}
            onSelectSection={setActiveSection}
          />
        </div>

        <main className="flex-1 space-y-6">
          <SettingsHeader
            title="Workspace controls"
            description="Adjust messaging defaults, workspace credits, security, and billing for LIT Search."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
    </div>
  );
}
