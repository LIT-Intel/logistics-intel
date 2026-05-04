import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { notFound } from "next/navigation";
import { sanityClient } from "@/sanity/lib/client";
import { FREE_TOOL_QUERY, ALL_FREE_TOOL_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { PageHero } from "@/components/sections/PageHero";
import { ProseShell } from "@/components/sections/ProseShell";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const revalidate = 1800;

export async function generateStaticParams() {
  const items = (await sanityClient.fetch<{ slug: string }[]>(ALL_FREE_TOOL_SLUGS).catch(() => [])) || [];
  return items.filter((i) => i.slug).map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const t = await sanityClient.fetch<any>(FREE_TOOL_QUERY, { slug: params.slug }).catch(() => null);
  if (!t) return buildMetadata({ title: "Tool not found", path: `/tools/${params.slug}` });
  return buildMetadata({
    title: `${t.name} — free tool`,
    description: t.tagline,
    path: `/tools/${params.slug}`,
    eyebrow: "Free tool",
    seo: t.seo,
  });
}

export default async function FreeToolPage({ params }: { params: { slug: string } }) {
  const t = await sanityClient.fetch<any>(FREE_TOOL_QUERY, { slug: params.slug }).catch(() => null);
  if (!t) notFound();

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Free tools", href: "/tools" },
          { label: t.name },
        ]}
      />

      <PageHero
        eyebrow={`Free tool · ${t.category || "Utility"}`}
        title={t.name}
        subtitle={t.tagline}
      />

      <section className="px-8 pb-12">
        <div className="mx-auto max-w-[820px]">
          <div className="rounded-3xl border border-dashed border-ink-100 bg-white p-2">
            <div className="rounded-2xl bg-ink-25 px-8 py-16 text-center">
              <div className="font-display text-[16px] font-semibold text-ink-900">Tool widget</div>
              <p className="font-body mx-auto mt-2 max-w-[480px] text-[13.5px] leading-relaxed text-ink-500">
                The interactive widget for this tool ships in Phase 3. For now, this page renders the SEO
                copy + how-to from Sanity so the route is indexed and ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {t.body && <ProseShell value={t.body} />}

      <CtaBanner
        eyebrow="Want this for real data?"
        title="LIT runs this against your accounts."
        subtitle="The free tool is great for one-offs. The platform runs every calculation continuously across your real ICP."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: t.name,
            description: t.tagline,
            url: siteUrl(`/tools/${params.slug}`),
            applicationCategory: "BusinessApplication",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
    </PageShell>
  );
}
