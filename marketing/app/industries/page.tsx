import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: "Industries — playbooks for vertical revenue teams",
  description:
    "How LIT works for furniture importers, machinery, automotive, apparel, electronics, and more. Each industry has its own ICP, lanes, and outbound playbook.",
  path: "/industries",
  eyebrow: "Industries",
});

const INDEX_QUERY = groq`*[_type == "industry"] | order(name asc){
  _id, name, slug, icon, tagline, kpiCount
}`;

export default async function IndustriesPage() {
  const industries = (await sanityClient.fetch<any[]>(INDEX_QUERY).catch(() => [])) || [];

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Industries" },
        ]}
      />
      <PageHero
        eyebrow="Industries"
        title="Vertical-specific playbooks"
        titleHighlight="for revenue teams"
        titleSuffix="that don't sell to everyone."
        subtitle="Pick your vertical. We'll show you the ICP, the lanes, the personas, and the outbound playbook that actually moves pipeline."
        align="center"
      />

      {industries.length === 0 ? (
        <section className="px-5 sm:px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">No industries yet</div>
              <p className="font-body mx-auto mt-2 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
                Add industry pages from <code className="font-mono">/studio</code>.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="px-5 sm:px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {industries.map((i) => (
                <Link
                  key={i._id}
                  href={`/industries/${i.slug?.current}`}
                  className="group rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                >
                  <h3 className="display-sm">{i.name}</h3>
                  {i.tagline && (
                    <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{i.tagline}</p>
                  )}
                  <div className="font-display mt-4 text-[12px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                    See playbook →
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner
        eyebrow="Don't see yours?"
        title="We probably support it."
        subtitle="LIT covers 200+ industries with verified ICPs and lane mappings. Tell us yours and we'll show you the data."
        primaryCta={{ label: "Talk to us", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Contact sales", href: "/contact" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "Industries we serve",
              description:
                "How LIT works for furniture importers, machinery, automotive, apparel, electronics, and more. Each industry has its own ICP, lanes, and outbound playbook.",
              path: "/industries",
              items: industries
                .filter((i: any) => i?.slug?.current && i?.name)
                .map((i: any) => ({
                  name: i.name,
                  url: `/industries/${i.slug.current}`,
                })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}
