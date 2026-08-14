import type { Metadata } from "next";
import { SearchDemandPage, type SearchDemandPageData } from "@/components/sections/SearchDemandPage";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Bill of Lading Database for Freight Sales Teams",
  description: "Search bill of lading data by importer, supplier, lane, port, carrier, and product, then connect shipment evidence to freight sales accounts and contacts.",
  path: "/bill-of-lading-database",
  eyebrow: "Bill of lading database",
});

const page: SearchDemandPageData = {
  slug: "bill-of-lading-database",
  eyebrow: "Bill of lading database",
  title: "Search shipment records, then turn the evidence into a freight sales account.",
  intro: "Logistics Intel organizes U.S. customs bill of lading records around the questions freight sales teams ask: who is shipping, what they move, which lanes they use, how often they move, and who to contact next.",
  definition: "A bill of lading database is a searchable collection of shipment records that identifies parties, products, ports, carriers, dates, and routing details associated with cargo movements. For freight sales, the useful version does more than return rows. It resolves duplicate names into company profiles, summarizes shipment patterns, and connects those patterns to account research and outreach.",
  capabilities: [
    { title: "Search beyond company names", body: "Filter shipment activity by importer, supplier, product description, HS code, origin, destination, port, carrier, and date instead of relying on one exact company spelling." },
    { title: "Resolve records into accounts", body: "Group related filings and company-name variations into a usable account view with recent activity, top lanes, carrier mix, volume patterns, and shipment cadence." },
    { title: "Move from research to action", body: "Save the company, find relevant logistics and supply-chain contacts, create a Pulse AI account brief, and continue the work inside Command Center." },
  ],
  workflow: [
    { title: "Define the freight pattern", body: "Start with the lane, product, port, carrier, geography, or shipper profile your team can serve well." },
    { title: "Verify current activity", body: "Review recent shipment records, cadence, counterparties, and lane concentration before deciding an account belongs in the pipeline." },
    { title: "Prepare the sales motion", body: "Identify the right contact, save the account, document the freight angle, and build outreach around observable shipment activity." },
  ],
  faqs: [
    { question: "What information appears in a bill of lading database?", answer: "Common fields include shipper, consignee, notify party, carrier, vessel, origin and destination ports, product description, shipment date, weight, quantity, and container information. Field availability varies by filing and source." },
    { question: "Can I search bill of lading records by product?", answer: "Yes. Logistics Intel supports product-description and HS-code research alongside company, port, carrier, lane, and geography filters, allowing a sales team to define a market by what is moving rather than by a purchased company list." },
    { question: "How does bill of lading data help a freight forwarder?", answer: "It provides evidence that a company ships, shows the lanes and products involved, reveals cadence and carrier patterns, and gives a rep a factual reason to prioritize the account and tailor the first conversation." },
    { question: "Is a bill of lading database the same as a contact database?", answer: "No. Shipment records describe freight activity; contact data identifies people. Logistics Intel connects the two workflows so a rep can research the shipment pattern and then find relevant logistics, supply-chain, import, procurement, or transportation contacts where available." },
  ],
  related: [
    { href: "/trade-intelligence", label: "Trade intelligence", body: "Explore how shipment records become lane, port, carrier, and company-level intelligence." },
    { href: "/importer-leads", label: "Importer leads", body: "Build prospect lists from companies with observable U.S. import activity." },
    { href: "/company-intelligence", label: "Company intelligence", body: "See how Pulse Explorer organizes freight accounts on an interactive map." },
  ],
};

export default function BillOfLadingDatabasePage() {
  return <SearchDemandPage page={page} />;
}
