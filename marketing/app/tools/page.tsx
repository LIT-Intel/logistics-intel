import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: "Free tools — calculators and lookups for logistics + GTM teams",
  description:
    "Free, no-signup tools: HS code lookup, TEU calculator, lane volume estimator, ICP scorer, and more. Built by the LIT team.",
  path: "/tools",
  eyebrow: "Free Tools",
});

const INDEX = groq`*[_type == "freeTool"] | order(displayOrder asc, name asc){
  _id, name, slug, tagline, category, requiresAuth
}`;

export default async function ToolsPage() {
  const tools = (await sanityClient.fetch<any[]>(INDEX).catch(() => [])) || [];

  return (
    <PageShell>
      <PageHero
        eyebrow="Free tools"
        title="Free, no-signup"
        titleHighlight="logistics + GTM tools."
        subtitle="Built by the LIT team — for teams that just need a quick answer. No signup, no dark patterns, no email gates."
        align="center"
      />

      {tools.length === 0 ? (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">
                Free freight tools — launching this month
              </div>
              <p className="font-body mx-auto mt-2 max-w-[480px] text-[14px] leading-relaxed text-ink-500">
                Lane volume estimator, HS code lookup, TEU calculator, and shipper search — built on
                live trade data. In the meantime,{" "}
                <Link href="/demo" className="text-brand-blue-700 underline">
                  book a demo
                </Link>
                {" "}to use these directly inside the LIT platform.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tools.map((t) => (
                <Link
                  key={t._id}
                  href={`/tools/${t.slug?.current}`}
                  className="group rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                >
                  {t.category && (
                    <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                      {t.category}
                    </div>
                  )}
                  <h3 className="display-sm mt-2">{t.name}</h3>
                  {t.tagline && (
                    <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{t.tagline}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner
        eyebrow="Need more"
        title="The full platform is two clicks away."
        subtitle="LIT runs all of these calculations against your real accounts and lanes — and tells you what to do about it."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
