import Link from "next/link";
import { Linkedin, Twitter, Youtube, Rss } from "lucide-react";
import { LitLogoMark } from "../seo/LitLogoMark";

/**
 * Five-column dark mega-footer (Vercel + Linear + ZoomInfo hybrid).
 *
 * Layout:
 *   - Top section: brand panel (col-span-2) + 4 link columns
 *   - Bottom band: copyright + legal links + social row, divided by border
 *
 * Column headers use inline micro-typography (uppercase / tracked) rather
 * than the .lit-pill / .lit-eyebrow-dark recipes — footer styling is
 * intentionally component-local so it doesn't drift with the eyebrow
 * unification work in flight elsewhere.
 *
 * All hrefs were verified against the App Router file tree (May 2026).
 * `/solutions/<slug>` entries resolve through the `app/solutions/[slug]`
 * dynamic route backed by `app/solutions/_data.ts`.
 */

type FooterLink = { label: string; href: string; external?: boolean };
type FooterColumn = { heading: string; links: FooterLink[] };

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Product",
    links: [
      { label: "All features", href: "/features" },
      { label: "Pulse AI", href: "/pulse" },
      { label: "Company Intelligence", href: "/company-intelligence" },
      { label: "Contact Intelligence", href: "/contact-intelligence" },
      { label: "Command Center CRM", href: "/command-center" },
      { label: "Outbound Engine", href: "/outbound-engine" },
      { label: "Integrations", href: "/integrations" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "Freight forwarders", href: "/solutions/freight-forwarders" },
      { label: "Freight brokers", href: "/solutions/freight-brokers" },
      { label: "Customs brokers", href: "/solutions/customs-brokers" },
      { label: "3PL sales", href: "/solutions/3pl-sales" },
      { label: "Logistics sales teams", href: "/solutions/logistics-sales-teams" },
      { label: "By industry", href: "/freight-leads" },
      { label: "By trade lane", href: "/lanes" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Customer stories", href: "/customers" },
      { label: "Trade intelligence", href: "/trade-intelligence" },
      { label: "Tariff calculator", href: "/tools/tariff-calculator" },
      { label: "All tools", href: "/tools" },
      { label: "Glossary", href: "/glossary" },
      { label: "Compare LIT", href: "/vs" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Security", href: "/security" },
      { label: "Contact", href: "/contact" },
      { label: "Affiliate program", href: "/partners" },
    ],
  },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "DPA", href: "/legal/dpa" },
  { label: "Security", href: "/security" },
];

const SOCIAL_LINKS: { label: string; href: string; Icon: typeof Linkedin }[] = [
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/logisticintel",
    Icon: Linkedin,
  },
  {
    label: "X (Twitter)",
    href: "https://twitter.com/logisticintel",
    Icon: Twitter,
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@logisticintel",
    Icon: Youtube,
  },
  { label: "RSS feed", href: "/blog/rss.xml", Icon: Rss },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-dark-1 text-ink-200">
      {/* Soft cyan halo above the link grid — same treatment as the
          previous footer so the visual rhythm of the page bottom is
          preserved as readers scroll to it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 opacity-50"
        style={{ background: "radial-gradient(ellipse, rgba(0,240,255,0.08), transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-container px-6 py-16 md:px-8 md:py-20">
        {/* Top: brand panel + 4 link columns */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6 md:gap-8">
          {/* Brand panel — spans 2 of 6 columns on md+ */}
          <div className="col-span-2 md:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <LitLogoMark size={28} />
              <span className="font-display text-[18px] font-bold tracking-[-0.02em] text-white">
                Logistic{" "}
                <span className="font-extrabold" style={{ color: "#00F0FF" }}>
                  Intel
                </span>
              </span>
            </Link>
            <p className="font-body mt-4 max-w-[300px] text-[14px] leading-relaxed text-ink-200">
              Freight prospecting software for forwarders, brokers, and 3PLs. Live trade
              intelligence, verified contacts, and a freight-native CRM in one platform.
            </p>

            {/* Newsletter signup — submits to /api/newsletter (GET fallback to
                /resources if JS is disabled or the endpoint is missing). The
                form is server-rendered, no client component required; the
                marketing site adds JS handlers via the existing analytics
                attribution boot. */}
            <form
              action="/api/newsletter"
              method="post"
              className="mt-6 max-w-[340px]"
              aria-label="Subscribe to the weekly Pulse digest"
            >
              <label
                htmlFor="footer-newsletter-email"
                className="block text-[12px] font-semibold uppercase tracking-[0.14em] text-white/95"
              >
                Get the weekly Pulse digest
              </label>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-200/80">
                Lane movements, new importers, and the 5 BOL filings to act on this week.
              </p>
              <div className="mt-3 flex items-stretch overflow-hidden rounded-md border border-white/10 bg-white/5 focus-within:border-[#00F0FF]/60">
                <input
                  id="footer-newsletter-email"
                  type="email"
                  name="email"
                  required
                  placeholder="you@company.com"
                  className="font-body flex-1 bg-transparent px-3 py-2 text-[13px] text-white placeholder:text-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  className="font-display bg-[#00F0FF] px-3 py-2 text-[12px] font-semibold tracking-tight text-dark-1 transition-colors hover:bg-[#7CF5FF]"
                >
                  Subscribe
                </button>
              </div>
            </form>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading} className="md:col-span-1">
              <h4 className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-white/95">
                {col.heading}
              </h4>
              <ul className="mt-4 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="font-body block py-0.5 text-[14px] text-ink-200 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom band: copyright + legal + social */}
        <div className="mt-14 flex flex-col items-start gap-4 border-t border-white/10 py-6 text-[13px] text-ink-200/70 md:flex-row md:items-center md:justify-between">
          <div className="font-body">
            © {new Date().getFullYear()} Logistic Intel, Inc. All rights reserved.
          </div>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="font-body text-ink-200/70 transition-colors hover:text-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <ul className="flex items-center gap-4">
            {SOCIAL_LINKS.map(({ label, href, Icon }) => {
              const isExternal = href.startsWith("http");
              const linkProps = isExternal
                ? { target: "_blank" as const, rel: "noopener noreferrer" }
                : {};
              return (
                <li key={label}>
                  <a
                    href={href}
                    aria-label={label}
                    {...linkProps}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-200/70 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Icon size={18} strokeWidth={1.75} />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </footer>
  );
}
