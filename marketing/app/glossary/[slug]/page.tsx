import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sanityClient } from "@/sanity/lib/client";
import { GLOSSARY_TERM_QUERY, GLOSSARY_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { ProseShell } from "@/components/sections/ProseShell";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const revalidate = 600;

export async function generateStaticParams() {
  const terms = (await sanityClient.fetch<{ slug: { current: string } }[]>(
    GLOSSARY_INDEX_QUERY,
  ).catch(() => [])) || [];
  return terms.filter((t) => t.slug?.current).map((t) => ({ slug: t.slug.current }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const term = await sanityClient
    .fetch<any>(GLOSSARY_TERM_QUERY, { slug: params.slug })
    .catch(() => null);
  if (!term) return buildMetadata({ title: "Term not found", path: `/glossary/${params.slug}` });
  return buildMetadata({
    title: `${term.term}${term.abbreviation ? ` (${term.abbreviation})` : ""} — Definition`,
    description: term.shortDefinition,
    path: `/glossary/${params.slug}`,
    eyebrow: "Glossary",
    seo: term.seo,
  });
}

export default async function GlossaryTermPage({ params }: { params: { slug: string } }) {
  const term = await sanityClient
    .fetch<any>(GLOSSARY_TERM_QUERY, { slug: params.slug })
    .catch(() => null);
  if (!term) notFound();

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Glossary", href: "/glossary" },
          { label: term.term },
        ]}
      />

      <article>
        <header className="px-5 sm:px-8 pt-6 pb-10">
          <div className="mx-auto max-w-[760px]">
            <div className="lit-pill">
              <span className="dot" />
              {term.category || "Term"}
            </div>
            <h1 className="display-xl mt-5">
              {term.term}
              {term.abbreviation && (
                <span className="font-mono ml-3 text-[28px] font-medium text-ink-200">
                  ({term.abbreviation})
                </span>
              )}
            </h1>
            {term.shortDefinition && <p className="lead mt-5">{term.shortDefinition}</p>}
          </div>
        </header>

        {term.body && <ProseShell value={term.body} />}

        {term.alsoKnownAs?.length > 0 && (
          <section className="px-5 sm:px-8 py-6">
            <div className="mx-auto max-w-[760px]">
              <div className="rounded-xl border border-ink-100 bg-ink-25 px-5 py-4">
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
                  Also known as
                </div>
                <div className="font-body mt-1 text-[14px] text-ink-700">
                  {term.alsoKnownAs.join(" · ")}
                </div>
              </div>
            </div>
          </section>
        )}

        {term.relatedTerms?.length > 0 && (
          <section className="px-5 sm:px-8 py-10">
            <div className="mx-auto max-w-[760px]">
              <div className="font-display mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                Related terms
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {term.relatedTerms.map((t: any) => (
                  <Link
                    key={t.slug?.current || t.term}
                    href={`/glossary/${t.slug?.current}`}
                    className="rounded-xl border border-ink-100 bg-white p-4 transition hover:border-brand-blue/30 hover:shadow-sm"
                  >
                    <div className="font-display text-[14px] font-semibold text-ink-900">{t.term}</div>
                    {t.shortDefinition && (
                      <div className="font-body mt-1 text-[12.5px] leading-snug text-ink-500 line-clamp-2">
                        {t.shortDefinition}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {term.relatedPosts?.length > 0 && (
          <section className="px-5 sm:px-8 py-10">
            <div className="mx-auto max-w-[760px]">
              <div className="font-display mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                Related reading
              </div>
              <div className="space-y-3">
                {term.relatedPosts.map((p: any) => (
                  <Link
                    key={p.slug?.current || p.title}
                    href={`/blog/${p.slug?.current}`}
                    className="block rounded-xl border border-ink-100 bg-white p-4 transition hover:border-brand-blue/30 hover:shadow-sm"
                  >
                    <div className="font-display text-[15px] font-semibold text-ink-900">{p.title}</div>
                    {p.excerpt && (
                      <div className="font-body mt-1 text-[13px] leading-snug text-ink-500 line-clamp-2">
                        {p.excerpt}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </article>

      <CtaBanner
        eyebrow="See it in action"
        title="LIT turns terms into pipeline."
        subtitle="Want to find every importer shipping under this lane / HS code / mode? That's literally what Pulse does."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Try free", href: APP_SIGNUP_URL }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "DefinedTerm",
            name: term.term,
            alternateName: [term.abbreviation, ...(term.alsoKnownAs || [])].filter(Boolean),
            description: term.shortDefinition,
            inDefinedTermSet: {
              "@type": "DefinedTermSet",
              name: "Logistic Intel Glossary",
              url: siteUrl("/glossary"),
            },
            url: siteUrl(`/glossary/${params.slug}`),
          }),
        }}
      />
    </PageShell>
  );
}
