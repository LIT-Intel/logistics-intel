import type { Metadata } from "next";
import { PageShell } from "@/components/sections/PageShell";
import { ProductHero } from "@/components/sections/ProductHero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { CompanyIntelMock } from "@/components/sections/CompanyIntelMock";
import { ContactDiscoveryMock } from "@/components/sections/ContactDiscoveryMock";
import { SequenceBuilderMock } from "@/components/sections/SequenceBuilderMock";
import { PulseBriefMock } from "@/components/sections/PulseBriefMock";
import { DashboardMock } from "@/components/sections/DashboardMock";
import { buildMetadata } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const metadata: Metadata = buildMetadata({
  title: "LIT Platform | Trade Intelligence, Contacts, CRM, and Campaigns",
  description:
    "Explore the LIT platform: company search, shipment intelligence, contact enrichment, Command Center CRM, Pulse AI, and outbound campaigns for logistics sales teams.",
  path: "/products",
  eyebrow: "Platform",
});

const FEATURES = [
  { icon: "Search", tag: "Company Search", title: "Find by trade activity, not just firmographics", body: "Search company and trade intelligence by name, domain, industry, location, shipment history, lane, mode, and HS code. Local-first, then expand into external trade data when deeper context is needed." },
  { icon: "Building2", tag: "Company Profiles", title: "Every messy BOL turned into one clean account view", body: "Volume, TEU, top lanes, FCL/LCL split, suppliers, recent shipments, container patterns, and opportunity signals — all on one page." },
  { icon: "Users", tag: "Contact Intelligence", title: "Find the people behind the freight", body: "Search by role, title, department, seniority, and location. Preview contacts first, then enrich only what your team is ready to work." },
  { icon: "LayoutDashboard", tag: "Command Center", title: "A CRM workspace built around freight", body: "Save companies, manage stages, assign owners, track activity, build focused outreach lists. The bridge between intelligence and action." },
  { icon: "Send", tag: "Outbound Engine", title: "Send outreach with a reason to reach out", body: "Email, LinkedIn, call tasks, and follow-ups built around real shipment context. Connected Gmail / Outlook so the rep is the sender, not the system." },
  { icon: "Sparkles", tag: "Pulse AI", title: "Ask better questions, get better answers", body: "Natural-language search across companies, contacts, lanes, industries, and locations. Pulse turns raw data into prospect lists, account briefs, and campaign angles." },
];

export default function ProductsPage() {
  return (
    <PageShell>
      <ProductHero
        eyebrow="The Logistic Intel platform"
        title="The connected revenue workspace"
        titleHighlight="for logistics sales."
        subtitle="Logistic Intel brings the core tools your sales team needs into one platform: company discovery, shipment intelligence, contact enrichment, CRM workflows, and outbound campaigns. From search to outreach in one clean workflow."
        visual={<DashboardMock />}
      />

      <FeatureGrid features={FEATURES} cols={3} />

      {/* Company Intelligence */}
      <section className="px-5 sm:px-8 py-20">
        <div className="mx-auto max-w-container">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <div className="eyebrow">Company profiles</div>
              <h2 className="display-lg mt-3">
                Every messy BOL feed, turned into one <span className="grad-text">clean account view.</span>
              </h2>
              <p className="lead mt-5 max-w-[480px]">
                Open any company and see what they actually move: trailing 12-month volume, TEU,
                top lanes, FCL/LCL mix, suppliers, recent shipments, container patterns, and
                opportunity signals. No tab-switching, no spreadsheet stitching.
              </p>
            </div>
            <div><CompanyIntelMock /></div>
          </div>
        </div>
      </section>

      {/* Pulse Brief */}
      <section className="px-5 sm:px-8 py-20">
        <div className="mx-auto max-w-container">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="lg:order-1"><PulseBriefMock /></div>
            <div className="lg:order-2">
              <div className="eyebrow">Pulse AI account intelligence</div>
              <h2 className="display-lg mt-3">
                The first 30 seconds of <span className="grad-text">account research,</span> already done.
              </h2>
              <p className="lead mt-5 max-w-[480px]">
                Click any account and Pulse generates a full intel brief — exec summary, opportunity
                signals (buying / forwarder / carrier / supplier), risk flags, and ready-to-send
                outreach hooks. Cited sources, refreshed weekly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contacts */}
      <section className="px-5 sm:px-8 py-20">
        <div className="mx-auto max-w-container">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <div className="eyebrow">Contact intelligence</div>
              <h2 className="display-lg mt-3">
                Find the <span className="grad-text">right people</span> behind the freight.
              </h2>
              <p className="lead mt-5 max-w-[480px]">
                Search by role, seniority, department, and location. Preview contacts first, then
                enrich only the ones your team is ready to work — no credit waste on accounts you'll
                never touch.
              </p>
            </div>
            <div><ContactDiscoveryMock /></div>
          </div>
        </div>
      </section>

      {/* Outbound */}
      <section className="px-5 sm:px-8 py-20">
        <div className="mx-auto max-w-container">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="lg:order-1"><SequenceBuilderMock /></div>
            <div className="lg:order-2">
              <div className="eyebrow">Outbound Engine</div>
              <h2 className="display-lg mt-3">
                Send outreach with <span className="grad-text">a reason</span> to reach out.
              </h2>
              <p className="lead mt-5 max-w-[480px]">
                Build email + LinkedIn + call sequences seeded by real account context — lane,
                carrier mix, recent volume, supplier shifts. Connected Gmail / Outlook means the
                rep is the sender, not a generic system address.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="One workspace, one workflow"
        title="Stop prospecting from cold lists. Start selling from freight intelligence."
        subtitle="Free trial gives you Pulse search, company profiles, and 10 saved companies. No credit card."
        primaryCta={{ label: "Start Prospecting", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a Demo", href: "/demo" }}
      />
    </PageShell>
  );
}
