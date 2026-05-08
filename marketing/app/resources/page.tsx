import type { Metadata } from "next";
import Link from "next/link";
import { groq } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CustomerStoriesSection } from "@/components/sections/CustomerStoriesSection";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { BlogCard } from "@/components/sections/BlogCard";
import { ArrowRight, Route, BookOpen, Newspaper, HelpCircle } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { buildBreadcrumbList, buildCollectionPage } from "@/lib/jsonLd";

export const revalidate = 600; // ISR — refresh every 10 min

const RESOURCES_QUERY = groq`{
  "lanes": *[_type == "tradeLane" && defined(slug.current)] | order(_updatedAt desc)[0...6]{
    _id,
    title,
    "slug": slug.current,
    "originName": originPort.name,
    "originCountry": originPort.country,
    "destinationName": destinationPort.name,
    "destinationCountry": destinationPort.country,
    summary,
    kpis
  },
  "terms": *[_type == "glossaryTerm" && defined(slug.current)] | order(term asc)[0...12]{
    _id, term, "slug": slug.current, abbreviation, shortDefinition, category
  },
  "posts": *[_type == "blogPost" && defined(publishedAt) && defined(slug.current)] | order(publishedAt desc)[0...3]{
    _id, title, slug, excerpt, heroImage, heroImageUrl, heroImageAlt, publishedAt,
    "author": author->{name, avatar},
    "categories": categories[]->{title, color}
  }
}`;

export const metadata: Metadata = buildMetadata({
  title: "Resources — playbooks, lanes, and freight glossary | LIT",
  description:
    "Operator playbooks, live trade-lane intelligence, customer stories, and a freight glossary — every page built for the questions revenue teams actually ask.",
  path: "/resources",
  eyebrow: "Resources",
});

export default async function ResourcesPage() {
  const data = await sanityClient
    .fetch<{ lanes: any[]; terms: any[]; posts: any[] }>(RESOURCES_QUERY)
    .catch(() => ({ lanes: [], terms: [], posts: [] }));

  return (
    <PageShell>
      <PageHero
        eyebrow="Resources"
        title="Built for the freight teams"
        titleHighlight="running outbound on signal."
        subtitle="Live trade-lane intelligence, customer stories, operator playbooks, and a 200-term freight glossary — every page indexed for the questions your buyers actually ask."
        align="center"
      />

      <ResourceTopicNav />

      {/* Customer stories — pulls featured case studies from Sanity. Returns
          null if none are featured, so this section disappears gracefully. */}
      <CustomerStoriesSection />

      <TradeLanesTeaser lanes={data.lanes} />

      <GlossaryTeaser terms={data.terms} />

      <BlogTeaser posts={data.posts} />

      <CtaBanner
        eyebrow="Ready when you are"
        title="See LIT on your real lanes."
        subtitle="30-minute demo. We'll pull up your top 5 target accounts and show which are actively shipping right now."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildBreadcrumbList([
              { label: "Home", href: "/" },
              { label: "Resources" },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "Resources hub",
              description:
                "Operator playbooks, live trade-lane intelligence, customer stories, and a freight glossary — every page built for the questions revenue teams actually ask.",
              path: "/resources",
            }),
          ),
        }}
      />
    </PageShell>
  );
}

/** In-page anchor nav so a /resources visit lands on the right teaser fast. */
function ResourceTopicNav() {
  const topics: { label: string; href: string; icon: any }[] = [
    { label: "Trade lanes", href: "#trade-lanes", icon: Route },
    { label: "Glossary", href: "#glossary", icon: BookOpen },
    { label: "Blog", href: "#blog", icon: Newspaper },
    { label: "FAQ", href: "/faq", icon: HelpCircle },
  ];
  return (
    <section className="px-5 sm:px-8 pb-4">
      <div className="mx-auto max-w-container">
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.label}
                href={t.href}
                className="font-display inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:border-brand-blue/40 hover:text-brand-blue-700"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** 6-card trade-lane grid. Falls through to a "coming soon" empty state
 *  rather than a broken section when no lanes are published yet. */
function TradeLanesTeaser({ lanes }: { lanes: any[] }) {
  return (
    <section id="trade-lanes" className="px-5 sm:px-8 py-16 sm:py-20">
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="eyebrow">Trade Lane Intelligence</div>
          <h2 className="display-lg mt-3">
            The trade flows you sell into, <span className="grad-text">live and ranked.</span>
          </h2>
          <p className="lead mx-auto mt-4 max-w-[560px]">
            500+ origin × destination pairs, refreshed daily. Pick a lane to see top shippers,
            carrier mix, and YoY volume change.
          </p>
        </div>

        {lanes.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-12 text-center">
            <div className="font-display text-[16px] font-semibold text-ink-900">
              Lane pages publishing soon
            </div>
            <p className="font-body mx-auto mt-2 max-w-[440px] text-[13.5px] text-ink-500">
              The TradeLane Refresher agent runs nightly. Check back after the next cycle, or{" "}
              <Link href="/demo" className="text-brand-blue-700 underline">
                book a demo
              </Link>{" "}
              to see your specific lane right now.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lanes.map((l) => {
              const teu = l.kpis?.find((k: any) => k.label?.toLowerCase().includes("teu"));
              const trend = l.kpis?.find((k: any) => k.tone === "positive" || k.tone === "negative");
              return (
                <Link
                  key={l._id}
                  href={`/lanes/${l.slug}`}
                  className="group rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                >
                  <div className="font-display flex items-center gap-2 text-[13px] font-semibold text-ink-700">
                    <Route className="h-4 w-4 text-brand-blue" aria-hidden />
                    {l.originName ?? l.originCountry}
                    <span className="text-ink-200" aria-hidden>
                      →
                    </span>
                    {l.destinationName ?? l.destinationCountry}
                  </div>
                  <h3 className="font-display mt-3 text-[16px] font-semibold leading-tight text-ink-900 group-hover:text-brand-blue-700">
                    {l.title}
                  </h3>
                  {l.summary && (
                    <p className="font-body mt-2 text-[13px] leading-relaxed text-ink-500 line-clamp-3">
                      {l.summary}
                    </p>
                  )}
                  {(teu || trend) && (
                    <div className="font-mono mt-4 flex items-center gap-3 text-[11.5px] text-ink-500">
                      {teu && (
                        <span>
                          <strong className="text-ink-900">{teu.value}</strong> {teu.label}
                        </span>
                      )}
                      {trend && (
                        <span
                          className={
                            trend.tone === "positive" ? "text-emerald-600" : "text-rose-600"
                          }
                        >
                          {trend.value} {trend.label}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/lanes"
            className="font-display inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-700 hover:text-brand-blue-700"
          >
            Browse all 500+ trade lanes <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** 12-term glossary chip grid. Same empty-state pattern as lanes. */
function GlossaryTeaser({ terms }: { terms: any[] }) {
  return (
    <section id="glossary" className="px-5 sm:px-8 py-16 sm:py-20" style={{ background: "#f6f8fc" }}>
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="eyebrow">Freight glossary</div>
          <h2 className="display-lg mt-3">
            Speak the language <span className="grad-text">of trade data.</span>
          </h2>
          <p className="lead mx-auto mt-4 max-w-[560px]">
            200 plain-English definitions of the terms freight forwarders, brokers, and customs
            operators use every day.
          </p>
        </div>

        {terms.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-ink-150 bg-white px-7 py-12 text-center">
            <div className="font-display text-[16px] font-semibold text-ink-900">
              Glossary entries publishing soon
            </div>
            <p className="font-body mx-auto mt-2 max-w-[440px] text-[13.5px] text-ink-500">
              The Glossary Drafter agent populates this nightly. New entries appear here as they
              ship.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {terms.map((t) => (
              <Link
                key={t._id}
                href={`/glossary/${t.slug}`}
                className="group rounded-xl border border-ink-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
              >
                <div className="font-display flex items-baseline gap-2 text-[14px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                  {t.term}
                  {t.abbreviation && (
                    <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink-200">
                      {t.abbreviation}
                    </span>
                  )}
                </div>
                {t.shortDefinition && (
                  <p className="font-body mt-1.5 text-[12.5px] leading-snug text-ink-500 line-clamp-2">
                    {t.shortDefinition}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/glossary"
            className="font-display inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-700 hover:text-brand-blue-700"
          >
            Browse the full glossary <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** 3-card blog teaser — matches the home/blog hub card geometry. */
function BlogTeaser({ posts }: { posts: any[] }) {
  return (
    <section id="blog" className="px-5 sm:px-8 py-16 sm:py-20">
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="eyebrow">Field notes</div>
          <h2 className="display-lg mt-3">
            Operator-grade <span className="grad-text">GTM playbooks.</span>
          </h2>
          <p className="lead mx-auto mt-4 max-w-[560px]">
            Long-form analysis, trade-data deep dives, and tactical playbooks from teams running
            outbound on signal — not lists.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-12 text-center">
            <div className="font-display text-[16px] font-semibold text-ink-900">
              Posts publishing soon
            </div>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <BlogCard key={p._id} post={p} />
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/blog"
            className="font-display inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-700 hover:text-brand-blue-700"
          >
            All posts <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
