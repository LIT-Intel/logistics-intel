// Sector definitions for the /l/<sector> marketing landing pages.
// Keep copy concise and outcome-led. Each sector picks a different SVG
// animation so the visual differentiates the offer.

export type SectorId =
  | "freight-forwarders"
  | "freight-brokers"
  | "customs-brokers"
  | "nvocc"
  | "logistics-sales-teams";

export interface SectorMetric {
  value: string;
  label: string;
}

export interface SectorSection {
  title: string;
  body: string;
}

export interface Sector {
  id: SectorId;
  // Marketing
  eyebrow: string;
  headline: string;
  subheadline: string;
  // Visual cue
  illustration: "stack" | "broker" | "customs" | "nvocc" | "dashboard";
  accent: string;       // CSS color
  accentSoft: string;   // CSS color (background)
  // Trust strip
  metrics: SectorMetric[];
  // Value props
  benefits: SectorSection[];
  // Closing pitch
  closing: { title: string; body: string };
}

export const SECTORS: Record<SectorId, Sector> = {
  "freight-forwarders": {
    id: "freight-forwarders",
    eyebrow: "Built for freight forwarders",
    headline: "See every shipper your competitors are touching — before they do.",
    subheadline:
      "Logistic Intel turns ocean and air bills of lading into a live shipper feed, with verified contacts and outreach built in. Win more lanes without buying another list.",
    illustration: "stack",
    accent: "#0EA5E9",
    accentSoft: "#E0F2FE",
    metrics: [
      { value: "12K+", label: "logistics companies indexed" },
      { value: "5.8K", label: "verified contacts" },
      { value: "Live", label: "Bill-of-lading feeds" },
    ],
    benefits: [
      {
        title: "Find shippers actively moving freight on your lanes",
        body:
          "Filter by lane, port, commodity, mode and shipment volume. Watch every NVOCC-routed shipment your prospects make so you call them while the contract is in play.",
      },
      {
        title: "Skip the cold-list grind",
        body:
          "Verified Ops, Logistics and Procurement contacts on every account, refreshed automatically. No more cleaning Apollo dumps in a spreadsheet.",
      },
      {
        title: "Send sequenced outreach the same day you save the company",
        body:
          "Connect Gmail or Outlook in under a minute. Multi-step sequences with day + minute precision. Real opens, clicks, and replies tracked back to the shipper record.",
      },
    ],
    closing: {
      title: "From shipper data to booked freight in days, not quarters.",
      body:
        "Every plan starts free. Connect your inbox, save your first 10 shippers, and run a real sequence — with attribution back to who replied.",
    },
  },
  "freight-brokers": {
    id: "freight-brokers",
    eyebrow: "Built for freight brokers",
    headline: "Win more lanes by being the broker who knows the shipper's freight.",
    subheadline:
      "We pull active shipper movements straight from import/export records and pair them with verified decision-makers — so your reps walk into every call with intel the shipper hasn't shared yet.",
    illustration: "broker",
    accent: "#3B82F6",
    accentSoft: "#DBEAFE",
    metrics: [
      { value: "Real", label: "shipment volumes per shipper" },
      { value: "Lane", label: "matching by route + mode" },
      { value: "Built-in", label: "outbound sequencing" },
    ],
    benefits: [
      {
        title: "Lane-matched shipper pipeline",
        body:
          "Tell us the lanes you cover. We surface shippers who actually move freight on those lanes — with volumes, frequency, and current carriers.",
      },
      {
        title: "Verified operations contacts",
        body:
          "Every account has a maintained contact list. Filter to procurement, transportation, or distribution roles in one click.",
      },
      {
        title: "Sequenced outreach that respects sales rhythm",
        body:
          "Email steps, LinkedIn touches, and reminder tasks paced by day or minute. Open / click / reply analytics roll up to the rep and the account.",
      },
    ],
    closing: {
      title: "Move from cold-call broker to consultative broker.",
      body:
        "Show up to every conversation already knowing the shipper's lanes. Free trial — no credit card, real data day one.",
    },
  },
  "customs-brokers": {
    id: "customs-brokers",
    eyebrow: "Built for customs brokers",
    headline: "Catch importers exactly when they're stuck on classifications and duties.",
    subheadline:
      "We track who's importing what, where, and which carriers and brokers they used last. Pinpoint importers ready to switch — by HS-code, country, or duty exposure.",
    illustration: "customs",
    accent: "#7C3AED",
    accentSoft: "#EDE9FE",
    metrics: [
      { value: "HS", label: "code-level shipment data" },
      { value: "Section", label: "201/232/301 exposure flags" },
      { value: "All", label: "U.S. ports + modes" },
    ],
    benefits: [
      {
        title: "Importer detection by HS code & origin",
        body:
          "Filter live customs entries by HS chapter, country, port and consignee. Spot importers carrying high-duty SKUs you can save them money on.",
      },
      {
        title: "Compliance hooks that open doors",
        body:
          "Section 232/301 exposure, FTA eligibility, antidumping duty hits — all surfaced on the company profile so your pitch is service-led, not list-led.",
      },
      {
        title: "Fast outreach to the right contact",
        body:
          "Trade-compliance, import operations, supply chain VP — sequence them with day/minute pacing and watch every reply pull straight back to the company record.",
      },
    ],
    closing: {
      title: "Stop cold-emailing every name. Email the importers who need you now.",
      body:
        "Free trial, real customs data — no procurement-bait pitch. See three importers your reps can call this week.",
    },
  },
  "nvocc": {
    id: "nvocc",
    eyebrow: "Built for NVOCCs",
    headline: "Replace the spreadsheet of carrier contacts with a live shipper revenue feed.",
    subheadline:
      "We index every NVOCC-routed shipment in U.S. trade data, mapped to the shipper, the lane and the carrier. Spend more time on revenue calls, less on prospecting.",
    illustration: "nvocc",
    accent: "#0F766E",
    accentSoft: "#CCFBF1",
    metrics: [
      { value: "6.4K", label: "NVOCCs in our network" },
      { value: "Live", label: "ocean + air shipment feed" },
      { value: "API", label: "& exports for ops teams" },
    ],
    benefits: [
      {
        title: "Shippers, ranked by ocean volume",
        body:
          "TEU growth, top lanes, top ports, current carrier. Every shipper profile carries the data your sales team needs to argue rate.",
      },
      {
        title: "Carrier pivot signals",
        body:
          "Watch shippers shift carriers in real time. Outreach is timed when contracts are actually in motion, not on a quarterly cadence.",
      },
      {
        title: "Run sequences from your own inbox",
        body:
          "Send through Gmail or Outlook with full reply / open tracking. No third-party sender domain damaging your deliverability.",
      },
    ],
    closing: {
      title: "Beat the bigger NVOCC's data team without hiring one.",
      body:
        "Free trial. Connect your inbox, save your top accounts, run a campaign — see real opens within minutes.",
    },
  },
  "logistics-sales-teams": {
    id: "logistics-sales-teams",
    eyebrow: "Built for logistics sales leaders",
    headline: "One platform: shipment intel + verified contacts + outbound + reporting.",
    subheadline:
      "Stop stitching ZoomInfo, Apollo, Outreach and a homemade BoL feed. Logistic Intel ships them as one system — so reps spend their day on calls, not on cleanup.",
    illustration: "dashboard",
    accent: "#DC2626",
    accentSoft: "#FEE2E2",
    metrics: [
      { value: "Single", label: "shipment-data + contact + outbound" },
      { value: "Per-rep", label: "open / click / reply analytics" },
      { value: "Plan", label: "limits + admin controls" },
    ],
    benefits: [
      {
        title: "Account-based prospecting in one workspace",
        body:
          "Reps save shippers, see live shipment data, get suggested talking points from Pulse AI, and launch outbound — without switching tabs.",
      },
      {
        title: "Pipeline visibility that doesn't lie",
        body:
          "Every send, open, click and reply is attributed to the rep, account, and step. Roll-ups feed the team's pipeline review without manual logging.",
      },
      {
        title: "Sane plan limits + admin controls",
        body:
          "Per-seat usage caps, suppression list governance, daily-cap throttling per mailbox, and audit logs for compliance teams.",
      },
    ],
    closing: {
      title: "Cut three tools. Keep one. Hit quota faster.",
      body:
        "Free trial. Bring two reps and your top 25 accounts. See the difference inside a week.",
    },
  },
};
