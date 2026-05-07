import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { HubCard, HubCardGrid, HubEmptyState } from "@/components/sections/HubCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { ArrowRight } from "lucide-react";

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: "Use cases — what teams actually do with LIT",
  description:
    "Outbound prospecting, account expansion, supplier discovery, lane intelligence, market sizing — the real workflows revenue teams run on LIT.",
  path: "/use-cases",
  eyebrow: "Use Cases",
});

const INDEX = groq`*[_type == "useCase"] | order(persona asc){
  _id, slug, persona, headline, headlineHighlight, subhead, kpis
}`;

export default async function UseCasesPage() {
  const items = (await sanityClient.fetch<any[]>(INDEX).catch(() => [])) || [];

  return (
    <PageShell>
      <PageHero
        eyebrow="Use cases"
        title="What teams actually"
        titleHighlight="do with LIT."
        subtitle="Pick the workflow that maps to yours. Each use case has a real example, the data we pull, and the outbound playbook that converts."
        align="center"
      />

      <Section bottom="lg" width="container">
        {items.length === 0 ? (
          <HubEmptyState title="Use cases publishing soon">
            Specific workflows are seeded from{" "}
            <Link href="/solutions" className="text-brand-blue-700 underline">
              the solutions hub
            </Link>{" "}
            while this index publishes.
          </HubEmptyState>
        ) : (
          <HubCardGrid>
            {items.map((u) => (
              <HubCard
                key={u._id}
                href={`/use-cases/${u.slug?.current}`}
                className="flex flex-col gap-3"
              >
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-brand-blue">
                  For {u.persona}
                </div>
                <h3 className="display-sm">
                  {u.headline}{" "}
                  {u.headlineHighlight && (
                    <span className="grad-text">{u.headlineHighlight}</span>
                  )}
                </h3>
                {u.subhead && (
                  <p className="font-body flex-1 text-[14px] leading-relaxed text-ink-500 line-clamp-3">
                    {u.subhead}
                  </p>
                )}
                {u.kpis?.[0]?.value && (
                  <div className="font-body rounded-lg bg-ink-25 px-3 py-2 text-[12.5px] text-ink-700">
                    <span className="font-display font-bold uppercase tracking-wider text-ink-500">
                      {u.kpis[0].label}:
                    </span>{" "}
                    <span className="font-mono font-semibold text-brand-blue-700">
                      {u.kpis[0].value}
                    </span>
                  </div>
                )}
                <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                  See the workflow <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </HubCard>
            ))}
          </HubCardGrid>
        )}
      </Section>

      <CtaBanner
        eyebrow="See it in your stack"
        title="Pick a use case, see it live."
        subtitle="In a 30-min demo we walk through the use case that maps to your team — with your data, your accounts, your lanes."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Browse solutions", href: "/solutions" }}
      />
    </PageShell>
  );
}
