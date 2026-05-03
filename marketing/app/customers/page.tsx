import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { sanityClient } from "@/sanity/lib/client";
import { CUSTOMERS_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { LogoRail } from "@/components/sections/LogoRail";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { resolveLogoUrl } from "@/lib/sanityImage";

export const revalidate = 600;

export const metadata: Metadata = buildMetadata({
  title: "Customers — revenue teams shipping faster on LIT",
  description:
    "How real revenue teams use LIT to outpace competitors. Case studies, results, and the playbooks behind them.",
  path: "/customers",
  eyebrow: "Customers",
});

export default async function CustomersPage() {
  const data = await sanityClient.fetch<any>(CUSTOMERS_INDEX_QUERY).catch(() => ({ caseStudies: [], logos: [] }));
  const caseStudies = data?.caseStudies || [];
  const logos = data?.logos || [];

  return (
    <PageShell>
      <PageHero
        eyebrow="Customers"
        title="Revenue teams"
        titleHighlight="ship faster"
        titleSuffix="on LIT."
        subtitle="The numbers below are real, the teams are real, and the playbooks they use are below each result."
        align="center"
      />

      {logos.length > 0 && <LogoRail eyebrow="Trusted by" logos={logos} />}

      {caseStudies.length === 0 ? (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">No case studies yet</div>
              <p className="font-body mx-auto mt-2 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
                Add a case study from <code className="font-mono">/studio</code> and it will appear here
                automatically (ISR refreshes every 10 minutes).
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {caseStudies.map((c: any) => {
                const logoSrc = resolveLogoUrl({ logo: c.logo, domain: c.domain }, 96);
                return (
                  <Link
                    key={c._id}
                    href={`/customers/${c.slug?.current}`}
                    className="group flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                  >
                    <div className="px-7 pt-7">
                      <div className="flex items-center gap-3">
                        <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-ink-100 bg-white">
                          {logoSrc ? (
                            <Image
                              src={logoSrc}
                              alt={c.customer}
                              fill
                              sizes="36px"
                              className="object-contain p-1"
                              unoptimized={logoSrc.includes("img.logo.dev")}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-ink-25 text-[13px] font-bold text-ink-500">
                              {c.customer?.[0]}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-display text-[15px] font-semibold text-ink-900">
                            {c.customer}
                          </div>
                          {c.industry?.name && (
                            <div className="font-body text-[12px] text-ink-500">{c.industry.name}</div>
                          )}
                        </div>
                      </div>
                      <h3 className="font-display mt-5 text-[24px] font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700">
                        {c.headline}
                      </h3>
                      {c.subhead && (
                        <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{c.subhead}</p>
                      )}
                    </div>
                    {c.kpis?.length > 0 && (
                      <div className="mt-6 grid grid-cols-3 divide-x divide-ink-100 border-t border-ink-100">
                        {c.kpis.slice(0, 3).map((k: any, i: number) => (
                          <div key={i} className="px-4 py-4">
                            <div className="font-mono text-[20px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                              {k.value}
                            </div>
                            <div className="font-display mt-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                              {k.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {c.quote?.text && (
                      <div className="font-body border-t border-ink-100 bg-ink-25 px-7 py-4 text-[13.5px] italic leading-snug text-ink-700">
                        "{c.quote.text}"
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <CtaBanner
        eyebrow="Be next"
        title="See what LIT could do for your team."
        subtitle="A 30-min walkthrough with the team. We'll load your accounts, your lanes, and your industry."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "View pricing", href: "/pricing" }}
      />
    </PageShell>
  );
}
