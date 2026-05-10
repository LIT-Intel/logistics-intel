import Link from "next/link";
import { LitLogoMark } from "../seo/LitLogoMark";

const FOOTER_COLS: Array<{ heading: string; links: { label: string; href: string }[] }> = [
  {
    heading: "Platform",
    links: [
      { label: "All features", href: "/features" },
      { label: "Pulse AI", href: "/pulse" },
      { label: "Company Intelligence", href: "/company-intelligence" },
      { label: "Contact Intelligence", href: "/contact-intelligence" },
      { label: "Rate Benchmark", href: "/rate-benchmark" },
      { label: "Revenue Opportunity", href: "/revenue-opportunity" },
      { label: "Command Center (CRM)", href: "/command-center" },
      { label: "Outbound Engine", href: "/outbound-engine" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "All solutions", href: "/solutions" },
      { label: "Freight forwarders", href: "/solutions/freight-forwarders" },
      { label: "Freight brokers", href: "/solutions/freight-brokers" },
      { label: "3PL sales", href: "/solutions/3pl-sales" },
      { label: "Customs brokers", href: "/solutions/customs-brokers" },
      { label: "Logistics sales teams", href: "/solutions/logistics-sales-teams" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Resources hub", href: "/resources" },
      { label: "Blog", href: "/blog" },
      { label: "Glossary", href: "/glossary" },
      { label: "Importer directory", href: "/companies" },
      { label: "Trade lanes", href: "/lanes" },
      { label: "Customers", href: "/customers" },
      { label: "Comparisons", href: "/vs" },
      { label: "Alternatives", href: "/alternatives" },
      { label: "Best of", href: "/best" },
      { label: "FAQ", href: "/faq" },
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

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-dark-0 pb-10 pt-20 text-ink-200">
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[800px] -translate-x-1/2 opacity-60"
        style={{ background: "radial-gradient(ellipse, rgba(0,240,255,0.08), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-container px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <LitLogoMark size={28} />
              <span className="font-display text-[18px] font-bold tracking-[-0.02em] text-white">
                Logistic <span className="font-extrabold" style={{ color: "#00F0FF" }}>Intel</span>
              </span>
            </div>
            <p className="font-body mt-4 max-w-[280px] text-[13.5px] leading-relaxed text-ink-200">
              Freight revenue intelligence for forwarders, brokers, and logistics sales teams. The
              LIT app powers the daily prospecting and outreach workflow.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.heading}>
              <h4 className="font-display mb-3 text-[13px] font-semibold text-white">{col.heading}</h4>
              <ul className="space-y-1.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="font-body text-[13.5px] text-ink-200 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-white/5 pt-6 text-[12px] text-ink-200/80 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} Logistic Intel, Inc. All rights reserved.</div>
          <div className="flex gap-5">
            <Link href="/legal/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link href="/legal/terms" className="transition-colors hover:text-white">Terms</Link>
            <Link href="/legal/dpa" className="transition-colors hover:text-white">DPA</Link>
            <Link href="/security" className="transition-colors hover:text-white">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
