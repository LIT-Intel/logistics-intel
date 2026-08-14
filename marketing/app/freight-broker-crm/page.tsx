import type { Metadata } from "next";
import { SearchDemandPage, type SearchDemandPageData } from "@/components/sections/SearchDemandPage";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Freight Broker CRM for Shipper Sales Teams",
  description:
    "Manage shipper accounts, contacts, opportunities, quotes, tasks, pipeline, weighted forecasts, and sales reporting in a freight-native CRM.",
  path: "/freight-broker-crm",
  eyebrow: "Freight broker CRM",
});

const page: SearchDemandPageData = {
  slug: "freight-broker-crm",
  eyebrow: "Freight broker CRM",
  title: "A freight broker CRM built around shippers, lanes, quotes, and the next move.",
  intro:
    "Logistics Intel gives brokerage sales teams one place to research active shippers, organize the right contacts, manage deals, schedule follow-ups, and forecast pipeline without separating the CRM from the freight context behind the opportunity.",
  definition:
    "A freight broker CRM should show more than a company name and a generic deal stage. It should preserve why the shipper is a fit, which lanes and services matter, who owns the relationship, what has happened, what was quoted, and what the rep needs to do next. That is the difference between a database the team maintains and a sales workspace the team can actually use.",
  productPreview: "crm",
  capabilities: [
    {
      title: "Shipper accounts with freight context",
      body: "Keep shipment activity, estimated freight spend, lane patterns, contacts, notes, tasks, and deal history together on the account.",
    },
    {
      title: "A pipeline that matches freight sales",
      body: "Move opportunities through New, Qualified, Quoted, Negotiation, Won, and Lost with owners, values, close dates, services, and next steps visible.",
    },
    {
      title: "Forecasts managers can inspect",
      body: "Review open pipeline, weighted forecast, won revenue, deal velocity, stage conversion, win and loss results, and rep performance without rebuilding the report in a spreadsheet.",
    },
  ],
  workflow: [
    {
      title: "Qualify the shipper",
      body: "Review recent shipment activity, relevant lanes, service fit, and account signals before a rep spends time on outreach.",
    },
    {
      title: "Work the account",
      body: "Save the company, add the right contacts, assign an owner, create tasks, record activity, and keep the reason for pursuing the account visible.",
    },
    {
      title: "Manage the deal",
      body: "Track quotes and opportunity value, move the deal through the pipeline, monitor stale opportunities, and forecast what is realistically likely to close.",
    },
  ],
  faqs: [
    {
      question: "What makes Logistics Intel a freight broker CRM?",
      answer:
        "The CRM is connected to the shipper research that starts the opportunity. Accounts can carry shipment activity, lane context, logistics contacts, deal values, service types, tasks, activity, quotes, forecasts, and reporting in one workspace.",
    },
    {
      question: "Does the CRM support a complete deal pipeline?",
      answer:
        "Yes. Teams can manage New, Qualified, Quoted, Negotiation, Won, and Lost opportunities with owners, contacts, values, expected close dates, tasks, timelines, and weighted forecasting.",
    },
    {
      question: "Can managers report on brokerage pipeline performance?",
      answer:
        "Yes. Command Center reporting covers open pipeline, weighted forecast, won revenue, stage conversion, deal velocity, win and loss outcomes, and performance by owner and service type.",
    },
    {
      question: "Does Logistics Intel connect to email?",
      answer:
        "Connected Gmail and Microsoft Outlook sending are available. Other integrations remain marked as planned until they are released.",
    },
    {
      question: "What is included in the trial?",
      answer:
        "The 7-day trial includes 10 searches and 10 verified contacts, with no credit card required. Paid plans and CRM access are described on the pricing page.",
    },
  ],
  related: [
    {
      href: "/command-center",
      label: "Command Center",
      body: "See the account, pipeline, task, activity, forecast, and reporting workspace.",
    },
    {
      href: "/freight-broker-leads",
      label: "Freight broker leads",
      body: "Find active shippers using shipment activity and freight-fit signals.",
    },
    {
      href: "/pricing",
      label: "Plans and pricing",
      body: "Compare research, contact, CRM, support, and team-management options.",
    },
  ],
};

export default function FreightBrokerCrmPage() {
  return <SearchDemandPage page={page} />;
}
