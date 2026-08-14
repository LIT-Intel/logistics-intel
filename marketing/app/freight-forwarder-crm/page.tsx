import type { Metadata } from "next";
import { SearchDemandPage, type SearchDemandPageData } from "@/components/sections/SearchDemandPage";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Freight Forwarder CRM with Shipment Intelligence",
  description: "Manage freight sales accounts with shipment history, trade lanes, contacts, account briefs, tasks, outreach context, and pipeline stages in one workspace.",
  path: "/freight-forwarder-crm",
  eyebrow: "Freight forwarder CRM",
});

const page: SearchDemandPageData = {
  slug: "freight-forwarder-crm",
  eyebrow: "Freight forwarder CRM",
  title: "A freight sales CRM that already understands the account's shipment activity.",
  intro: "Command Center connects account ownership, contacts, tasks, outreach, and pipeline stages to the shipment and trade-lane context that freight forwarder sales teams use to qualify opportunities.",
  definition: "A freight forwarder CRM should manage more than names, notes, and deal stages. It should keep the account's shipment activity, lanes, products, contacts, research, follow-ups, and sales history together so the next action is based on freight context rather than an empty record created after the research is finished.",
  capabilities: [
    { title: "Account context from the beginning", body: "Start with company and shipment intelligence, then save the account with its lane, volume, carrier, supplier, and opportunity context attached." },
    { title: "Contacts tied to the shipper", body: "Organize relevant logistics, transportation, supply-chain, procurement, and import contacts alongside the company record and the reason the account was selected." },
    { title: "Pipeline without losing the research", body: "Move accounts through stages, assign next actions, preserve notes, and review activity without separating CRM hygiene from the trade data that created the opportunity." },
  ],
  workflow: [
    { title: "Find and qualify", body: "Search active shippers and review shipment cadence, lane fit, carrier patterns, and account-level opportunity signals." },
    { title: "Save and assign", body: "Add the account to Command Center, associate the right contacts, assign ownership, and document the freight angle." },
    { title: "Work the opportunity", body: "Track follow-ups, connected-mailbox outreach, notes, tasks, and pipeline movement while keeping the original freight evidence visible." },
  ],
  faqs: [
    { question: "What makes a CRM freight-forwarder specific?", answer: "It keeps shipment activity, trade lanes, shipper qualification, logistics contacts, account ownership, outreach, and pipeline stages together. A generic CRM can store a company; a freight-specific workflow helps explain why the company is worth pursuing now." },
    { question: "Does Logistics Intel replace every enterprise CRM?", answer: "Not necessarily. Command Center is designed to give freight sales teams a focused prospecting and account-workflow layer. Large organizations may keep a broader system of record and use planned or custom integrations as they become available." },
    { question: "Can teams send email from the platform?", answer: "Connected Gmail and Microsoft Outlook mailbox sending are available. Other connectors are described as planned on the integrations page until they are released." },
    { question: "Does the 7-day trial include the full paid-plan capacity?", answer: "No. The trial includes 10 searches and 10 verified contacts with no credit card required. Paid-plan quotas, seats, and support levels are shown transparently on the pricing page." },
  ],
  related: [
    { href: "/command-center", label: "Command Center", body: "Explore the account, contact, task, and pipeline workspace inside Logistics Intel." },
    { href: "/outbound-engine", label: "Freight outreach", body: "See how connected Gmail and Outlook sending fits into the prospecting workflow." },
    { href: "/pricing", label: "Plans and pricing", body: "Compare seats, research capacity, contact reveals, support, and governance." },
  ],
};

export default function FreightForwarderCrmPage() {
  return <SearchDemandPage page={page} />;
}
