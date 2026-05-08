// Public email-asset URLs.
//
// Files live in marketing/public/email-assets/ on the marketing site,
// which Vercel serves at https://www.logisticintel.com/email-assets/<file>.
// Email clients require absolute https:// URLs — relative paths,
// build-hashed asset URLs, blob URLs, and base64 data URIs are all
// either stripped or render as broken images in Outlook desktop.
//
// To swap a placeholder for a real screenshot:
//   1. Drop the JPG into marketing/public/email-assets/ with the same
//      basename (company-intelligence, contact-discovery, pulse-ai-brief)
//      and update the EXTENSION below if not .svg.
//   2. Commit + push. Vercel rebuilds, the marketing site picks it up.
//
// The Campaign Composer's resolveEmailTemplateHtml (in
// campaignEmailTemplates.ts) substitutes these URLs into the templates'
// {{*_public_url}} placeholders before insertion, so the final HTML
// the user composes always contains a fully-resolved absolute URL.

const SITE_URL = (() => {
  // Browser-side: prefer Vite env. Falls back to the production marketing
  // domain so a misconfigured preview still renders working email assets.
  const fromEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as any)?.env?.VITE_PUBLIC_SITE_URL
      ? String((import.meta as any).env.VITE_PUBLIC_SITE_URL).trim()
      : null;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://www.logisticintel.com";
})();

/**
 * Filename + extension for each asset key. Update the extension here when
 * the underlying file format changes (e.g. SVG placeholder → JPG screenshot).
 */
const ASSET_PATHS: Record<EmailAssetKey, string> = {
  company_intelligence: "/email-assets/company-intelligence.svg",
  contact_discovery: "/email-assets/contact-discovery.svg",
  pulse_ai: "/email-assets/pulse-ai-brief.svg",
  campaign_builder: "/email-assets/campaign-builder.svg",
  rate_benchmark: "/email-assets/rate-benchmark.svg",
};

export type EmailAssetKey =
  | "company_intelligence"
  | "contact_discovery"
  | "pulse_ai"
  | "campaign_builder"
  | "rate_benchmark";

/** Absolute https:// URL for a given asset key. */
export function emailAssetUrl(key: EmailAssetKey): string {
  return `${SITE_URL}${ASSET_PATHS[key]}`;
}

/** Static map for templates that resolve all asset URLs up front. */
export const EMAIL_ASSETS: Record<EmailAssetKey, string> = {
  company_intelligence: emailAssetUrl("company_intelligence"),
  contact_discovery: emailAssetUrl("contact_discovery"),
  pulse_ai: emailAssetUrl("pulse_ai"),
  campaign_builder: emailAssetUrl("campaign_builder"),
  rate_benchmark: emailAssetUrl("rate_benchmark"),
};
