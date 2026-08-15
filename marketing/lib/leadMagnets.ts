import { FileSearch, Trophy, ListChecks, Calculator, ShieldAlert, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for the free lead-magnet tools (§5 config-based, §25).
 *
 * These are the interactive, no-signup "money pages" that live at the top
 * level of the marketing site (e.g. /free-shipper-report). The /tools hub,
 * the homepage free-tools strip, and any nav surface all read from this
 * array so the list of magnets never drifts across the site.
 *
 * Copy here is intentionally short (hub-card / CTA length). Each route owns
 * its own full SEO metadata via buildMetadata in its page.tsx — do NOT try
 * to centralize that here; it would fight the per-page unique-metadata rule.
 */
export type LeadMagnet = {
  /** URL path (route lives at the top level; some under the (lead-magnets) group) */
  href: string;
  /** short slug — matches lit_lead_magnet_sessions.magnet_slug */
  slug: string;
  /** hub-card / nav title */
  name: string;
  /** one-line value prop for cards + nav descriptions */
  blurb: string;
  /** even shorter label for compact CTA buttons (homepage strip) */
  ctaLabel: string;
  category: string;
  icon: LucideIcon;
};

export const LEAD_MAGNETS: LeadMagnet[] = [
  {
    href: "/free-shipper-report",
    slug: "free-shipper-report",
    name: "Free Shipper Intelligence Report",
    blurb:
      "Get a free report on any U.S. importer — estimated 12-month shipment volume, TEU, top lanes, and destination ports from cached customs data.",
    ctaLabel: "Run a free shipper report",
    category: "Company intelligence",
    icon: FileSearch,
  },
  {
    href: "/top-shippers",
    slug: "top-shippers",
    name: "Top 25 Shippers",
    blurb:
      "Find the top companies moving freight in your market. Filter by industry, lane, and volume, then see the 25 ranked shippers with opportunity scores.",
    ctaLabel: "Find the top 25 shippers",
    category: "Prospecting",
    icon: Trophy,
  },
  {
    href: "/free-freight-prospects",
    slug: "free-freight-prospects",
    name: "Free Freight Prospect List",
    blurb:
      "Build a freight prospect list in minutes — a ranked list of active importers matched to your lanes, with volume, top lane, and opportunity score.",
    ctaLabel: "Build a prospect list",
    category: "Prospecting",
    icon: ListChecks,
  },
  {
    href: "/freight-revenue-calculator",
    slug: "freight-revenue-calculator",
    name: "Freight Account Revenue Calculator",
    blurb:
      "Estimate the annual freight revenue, gross profit, and probability-adjusted opportunity of any account in seconds. No signup.",
    ctaLabel: "Calculate freight revenue",
    category: "Sales planning",
    icon: Calculator,
  },
  {
    href: "/import-risk-scanner",
    slug: "import-risk-scanner",
    name: "Import & Tariff Risk Scanner",
    blurb:
      "Scan any U.S. importer for sourcing-country, port, and shipment-trend concentration indicators from cached customs data. Non-legal indicators only.",
    ctaLabel: "Scan import risk",
    category: "Customs",
    icon: ShieldAlert,
  },
];

/** Top magnets surfaced in compact CTA strips (homepage). Order = priority. */
export const FEATURED_LEAD_MAGNETS: LeadMagnet[] = [
  LEAD_MAGNETS[0], // free shipper report
  LEAD_MAGNETS[1], // top 25 shippers
  LEAD_MAGNETS[3], // freight revenue calculator
];
