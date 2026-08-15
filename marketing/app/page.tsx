import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, PackageSearch, Users2 } from "lucide-react";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/nav/Footer";
import { CompanyIntelMock } from "@/components/sections/CompanyIntelMock";
import { CrmPipelinePreview } from "@/components/sections/CrmPipelinePreview";
import { CustomerLogosRail } from "@/components/sections/CustomerLogosRail";
import { HomeShowcaseTabs, type ShowcaseTab } from "@/components/sections/HomeShowcaseTabs";
import { PulseExplorerMock } from "@/components/sections/pulse-explorer/PulseExplorerMock";
import { SignalJourney } from "@/components/sections/SignalJourney";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { buildMetadata } from "@/lib/seo";
import { FEATURED_LEAD_MAGNETS } from "@/lib/leadMagnets";

export const revalidate = 600;

export const metadata: Metadata = buildMetadata({
  path: "/",
  title: "Freight Sales Intelligence & CRM | Logistics Intel",
  description:
    "Find active shippers, research shipment activity, reach verified contacts, and manage every opportunity in a freight-native CRM.",
  eyebrow: "Logistics sales intelligence",
});

const customerLogos = [
  { domain: "chrobinson.com", name: "C.H. Robinson" },
  { domain: "rxo.com", name: "RXO" },
  { domain: "tql.com", name: "TQL" },
  { domain: "echo.com", name: "Echo Global Logistics" },
  { domain: "landstar.com", name: "Landstar" },
  { domain: "kuehne-nagel.com", name: "Kuehne + Nagel" },
  { domain: "dhl.com", name: "DHL" },
  { domain: "dsv.com", name: "DSV" },
  { domain: "expeditors.com", name: "Expeditors" },
];

const capabilities = [
  { icon: PackageSearch, title: "Live shipment activity", body: "See what is moving, where it is moving, and which accounts are gaining momentum.", tone: "bg-cyan-500" },
  { icon: Users2, title: "Verified decision-makers", body: "Move from the shipment signal to the people responsible for logistics and supply chain.", tone: "bg-blue-600" },
  { icon: BarChart3, title: "Freight-native CRM", body: "Manage accounts, deals, tasks, forecasts, and follow-up without losing the freight context.", tone: "bg-indigo-600" },
];

const audiences = [
  { title: "Freight brokers", body: "Find active shippers, identify relevant lanes, and build a better-qualified pipeline.", href: "/solutions/freight-brokers" },
  { title: "Freight forwarders", body: "Research importers and exporters, understand trade patterns, and prioritize global accounts.", href: "/solutions/freight-forwarders" },
  { title: "3PL sales teams", body: "Turn shipment activity into account plans, assigned opportunities, and measurable follow-up.", href: "/solutions/3pls" },
];

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <HomeHero />
        <CustomerLogosRail eyebrow="Trusted by freight teams at" logos={customerLogos} className="border-b border-ink-100/70 bg-white/35" />
        <SignalJourney />
        <ProductTour />
        <CapabilityBand />
        <FreeToolsBand />
        <AudienceSection />
        <FinalCta />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Logistics Intel",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Logistics sales intelligence and freight-native CRM for freight brokers, freight forwarders, and 3PL sales teams.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "7-day trial available." },
          }),
        }}
      />
    </>
  );
}

function HomeHero() {
  return (
    <section className="relative overflow-hidden px-5 pb-12 pt-16 sm:px-8 sm:pb-16 sm:pt-20 lg:pb-20 lg:pt-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(900px_520px_at_80%_12%,rgba(34,211,238,0.14),transparent_62%),radial-gradient(720px_440px_at_58%_0%,rgba(59,130,246,0.10),transparent_68%)]" />
      <div className="pointer-events-none absolute right-[-8%] top-10 -z-10 h-[520px] w-[760px] opacity-40 [background-image:linear-gradient(rgba(59,130,246,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,.08)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
      <div className="mx-auto grid max-w-container items-center gap-12 lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)] lg:gap-14">
        <div className="max-w-[610px]">
          <div className="eyebrow">Logistics sales intelligence</div>
          <h1 className="display-xl mt-5">Find the shippers worth pursuing. Work every opportunity in one place.</h1>
          <p className="lead mt-6 max-w-[590px]">Logistics Intel connects live shipment activity, verified contacts, Pulse AI, and a freight-native CRM so brokers, forwarders, and 3PLs can move from account research to pipeline without stitching together four tools.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={APP_SIGNUP_URL} className="font-display inline-flex h-12 items-center gap-2 rounded-xl bg-blue-600 px-6 text-[14px] font-semibold text-white shadow-glow-blue transition hover:-translate-y-0.5 hover:bg-blue-700">Start 7-day trial <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link href="#product-tour" className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/75 px-6 text-[14px] font-semibold text-ink-900 shadow-sm backdrop-blur transition hover:border-blue-200 hover:bg-white">See the product</Link>
          </div>
          <div className="font-body mt-4 flex items-center gap-2 text-[13px] text-ink-500"><Check className="h-4 w-4 text-blue-600" aria-hidden /> No credit card required.</div>
        </div>
        <div className="relative min-w-0">
          <div className="absolute -inset-5 -z-10 rounded-[38px] bg-gradient-to-br from-cyan-200/35 via-blue-200/25 to-transparent blur-2xl" />
          <CompanyIntelMock className="home-hero-product" />
        </div>
      </div>
    </section>
  );
}

function ProductTour() {
  const tabs: [ShowcaseTab, ...ShowcaseTab[]] = [
    { id: "explore", label: "Explore", eyebrow: "Discover the market", headline: "Find active shippers before the opportunity becomes obvious.", description: "Search by industry, geography, shipment behavior, and trade activity. Pulse Explorer turns a broad territory into a focused account list.", bullets: ["Search natural-language freight criteria", "See geographic concentrations and shipment signals", "Save qualified accounts for deeper research"], ctaLabel: "Explore Pulse", ctaHref: "/pulse", mock: <PulseExplorerMock /> },
    { id: "research", label: "Research", eyebrow: "Understand the opportunity", headline: "Deep freight visibility, built for sales.", description: "Research the account’s shipment cadence, lanes, suppliers, products, contacts, and recent changes before your first conversation.", bullets: ["Live shipment activity and lane history", "Supplier, product, and carrier intelligence", "Verified contacts and account context"], ctaLabel: "See company intelligence", ctaHref: "/company-intelligence", mock: <CompanyIntelMock /> },
    { id: "pipeline", label: "Pipeline", eyebrow: "Work the account", headline: "Keep the freight context attached to every opportunity.", description: "Move researched accounts directly into a CRM built around freight sales, with deals, tasks, ownership, forecasting, and reporting in one workspace.", bullets: ["Account and contact management", "Drag-and-drop deal stages and tasks", "Weighted forecasting and owner reporting"], ctaLabel: "Explore the CRM", ctaHref: "/freight-broker-crm", mock: <CrmPipelinePreview /> },
  ];
  return (
    <div id="product-tour" className="scroll-mt-24">
      <HomeShowcaseTabs eyebrow="One connected workflow" headline="See how a shipment signal becomes a sales opportunity." intro="The product tour advances automatically, or choose a stage to explore the workflow at your own pace." tabs={tabs} autoPlay autoPlayMs={7000} />
    </div>
  );
}

function CapabilityBand() {
  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto grid max-w-container overflow-hidden rounded-2xl border border-ink-100 bg-white/80 shadow-sm backdrop-blur md:grid-cols-3">
        {capabilities.map(({ icon: Icon, title, body, tone }, index) => (
          <article key={title} className={`flex gap-4 p-6 sm:p-7 ${index < capabilities.length - 1 ? "border-b border-ink-100 md:border-b-0 md:border-r" : ""}`}>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${tone}`}><Icon className="h-5 w-5" aria-hidden /></div>
            <div><h2 className="font-display text-[16px] font-semibold text-ink-900">{title}</h2><p className="font-body mt-1.5 text-[13px] leading-relaxed text-ink-500">{body}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}

// Compact free-tools strip (§26). A low-friction entry point that funnels
// visitors into the interactive lead magnets without pulling focus from the
// core LIT pitch above/below it. Config-driven via FEATURED_LEAD_MAGNETS.
function FreeToolsBand() {
  return (
    <section className="px-5 pb-4 pt-4 sm:px-8">
      <div className="mx-auto flex max-w-container flex-col gap-5 rounded-2xl border border-ink-100 bg-white/70 px-6 py-6 shadow-sm backdrop-blur sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-[420px]">
          <div className="font-display text-[12px] font-semibold uppercase tracking-[0.12em] text-blue-600">
            Free tools · no signup
          </div>
          <p className="font-body mt-1.5 text-[14px] leading-relaxed text-ink-500">
            Try LIT's data on any importer in your browser, then{" "}
            <Link href="/tools" className="font-semibold text-blue-700 hover:text-blue-800">
              see all free tools
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {FEATURED_LEAD_MAGNETS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="font-display inline-flex items-center gap-1.5 rounded-xl border border-ink-100 bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-900 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700"
            >
              {t.ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section className="px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[720px] text-center"><div className="eyebrow">Built for freight sales</div><h2 className="display-md mt-4">One platform. Three ways freight teams grow.</h2></div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {audiences.map((audience, index) => (
            <Link key={audience.title} href={audience.href} className="group rounded-2xl border border-ink-100 bg-white/75 p-7 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl">
              <div className="font-mono text-[11px] font-semibold text-blue-600">0{index + 1}</div><h3 className="font-display mt-7 text-[21px] font-semibold text-ink-900">{audience.title}</h3><p className="font-body mt-3 text-[14px] leading-relaxed text-ink-500">{audience.body}</p><span className="font-display mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-700">Learn more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-12 sm:px-8 sm:pb-20">
      <div className="relative mx-auto flex max-w-container flex-col gap-7 overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 via-cyan-50 to-slate-50 px-7 py-10 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative max-w-[650px]"><h2 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.025em] text-ink-900 sm:text-[38px]">Turn shipment activity into your next sales opportunity.</h2><p className="font-body mt-3 text-[15px] text-ink-500">Start with your market, your accounts, and a seven-day trial.</p></div>
        <div className="relative flex shrink-0 flex-wrap gap-3"><Link href={APP_SIGNUP_URL} className="font-display inline-flex h-12 items-center rounded-xl bg-blue-600 px-6 text-[14px] font-semibold text-white shadow-glow-blue transition hover:bg-blue-700">Start 7-day trial</Link><Link href="/demo" className="font-display inline-flex h-12 items-center rounded-xl border border-ink-100 bg-white px-6 text-[14px] font-semibold text-ink-900 shadow-sm transition hover:border-blue-200">Book a demo</Link></div>
      </div>
    </section>
  );
}
