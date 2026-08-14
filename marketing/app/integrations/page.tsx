import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";
import { resolveLogoUrl } from "@/lib/sanityImage";

export const revalidate = 600;

export const metadata: Metadata = buildMetadata({
  title: "Integrations — LIT plays nicely with your existing stack",
  description:
    "Send freight outreach through Gmail or Outlook today. Preview planned CRM, sales-engagement, automation, and data integrations for Logistics Intel.",
  path: "/integrations",
  eyebrow: "Integrations",
});

type Integration = {
  _id: string;
  name: string;
  slug?: { current: string };
  category?: string;
  logo?: any;
  domain?: string;
  tagline?: string;
  twoWaySync?: boolean;
  status?: "live" | "beta" | "coming-soon";
};

const FALLBACK_INTEGRATIONS: Integration[] = [
  { _id: "gmail", name: "Gmail", category: "Email sending", domain: "gmail.com", tagline: "Connect your mailbox and send LIT campaigns from your real Gmail identity.", status: "live" },
  { _id: "outlook", name: "Microsoft Outlook", category: "Email sending", domain: "microsoft.com", tagline: "Connect Microsoft 365 and send freight outreach from your Outlook mailbox.", status: "live" },
  { _id: "hubspot", name: "HubSpot", category: "CRM", domain: "hubspot.com", tagline: "Planned company, contact, deal, and activity synchronization.", status: "coming-soon" },
  { _id: "salesforce", name: "Salesforce", category: "CRM", domain: "salesforce.com", tagline: "Planned account, contact, and opportunity synchronization.", status: "coming-soon" },
  { _id: "outreach", name: "Outreach", category: "Sales engagement", domain: "outreach.io", tagline: "Planned prospect and shipment-signal handoff to Outreach sequences.", status: "coming-soon" },
  { _id: "apollo", name: "Apollo", category: "Sales engagement", domain: "apollo.io", tagline: "Planned contact and campaign handoff between Apollo and LIT.", status: "coming-soon" },
  { _id: "salesloft", name: "Salesloft", category: "Sales engagement", domain: "salesloft.com", tagline: "Planned contact and cadence handoff for freight sales teams.", status: "coming-soon" },
  { _id: "smartlead", name: "Smartlead", category: "Sales engagement", domain: "smartlead.ai", tagline: "Planned audience export and campaign-event synchronization.", status: "coming-soon" },
  { _id: "slack", name: "Slack", category: "Notifications", domain: "slack.com", tagline: "Planned shipper, lane, and reply alerts in team channels.", status: "coming-soon" },
  { _id: "zapier", name: "Zapier", category: "Automation", domain: "zapier.com", tagline: "Planned no-code triggers for LIT company, contact, and campaign events.", status: "coming-soon" },
  { _id: "snowflake", name: "Snowflake", category: "Data warehouse", domain: "snowflake.com", tagline: "Planned governed shipment and account data delivery.", status: "coming-soon" },
];

export default async function IntegrationsPage() {
  const list = FALLBACK_INTEGRATIONS;

  // Group by category
  const grouped = list.reduce<Record<string, Integration[]>>((acc, i) => {
    const k = i.category || "Other";
    (acc[k] = acc[k] || []).push(i);
    return acc;
  }, {});

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Integrations" },
        ]}
      />
      <PageHero
        eyebrow="Integrations"
        title="LIT plugs into the"
        titleHighlight="stack you already run."
        subtitle="Send from Gmail or Outlook today. CRM, sales-engagement, automation, notification, and warehouse connectors are shown below as planned integrations until they are production-ready."
        primaryCta={{ label: "Talk to sales", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Read API docs", href: "/contact" }}
        align="center"
      />

      {Object.entries(grouped).map(([category, items]) => (
        <section key={category} className="px-5 sm:px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              {category}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((it) => {
                const src = resolveLogoUrl({ logo: it.logo, domain: it.domain }, 96);
                const Wrapper: any = it.slug?.current ? Link : "div";
                const wrapperProps = it.slug?.current
                  ? { href: `/integrations/${it.slug.current}` }
                  : {};
                return (
                  <Wrapper
                    key={it._id}
                    {...wrapperProps}
                    className="group flex items-start gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-ink-100 bg-white">
                      {src ? (
                        <Image
                          src={src}
                          alt={it.name}
                          fill
                          sizes="40px"
                          className="object-contain p-1.5"
                          unoptimized={src.includes("img.logo.dev")}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-ink-25 text-[14px] font-bold text-ink-500">
                          {it.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-display truncate text-[15px] font-semibold text-ink-900">
                          {it.name}
                        </div>
                        {it.status === "beta" && <Badge>Beta</Badge>}
                        {it.status === "coming-soon" && <Badge muted>Planned</Badge>}
                        {it.status === "live" && <Badge>Available</Badge>}
                        {it.twoWaySync && <Badge accent>2-way</Badge>}
                      </div>
                      {it.tagline && (
                        <p className="font-body mt-1 text-[13px] leading-snug text-ink-500 line-clamp-2">
                          {it.tagline}
                        </p>
                      )}
                    </div>
                  </Wrapper>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <CtaBanner
        eyebrow="Need a custom integration?"
        title="API + webhooks for the rest."
        subtitle="On Scale and Enterprise plans you get full API access plus webhook events for every signal, save, reveal, and campaign event."
        primaryCta={{ label: "Talk to sales", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Read docs", href: "/contact" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "LIT integrations",
              description:
                "Available Gmail and Outlook sending plus planned CRM, sales-engagement, automation, notification, and data integrations for Logistics Intel.",
              path: "/integrations",
              items: list
                .filter((i) => i?.slug?.current && i?.name)
                .map((i) => ({
                  name: i.name,
                  url: `/integrations/${i.slug!.current}`,
                })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}

function Badge({ children, accent, muted }: { children: React.ReactNode; accent?: boolean; muted?: boolean }) {
  const cls = accent
    ? "border-brand-blue/30 bg-brand-blue/10 text-brand-blue-700"
    : muted
      ? "border-ink-100 bg-ink-25 text-ink-500"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <span
      className={`font-display inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  );
}
