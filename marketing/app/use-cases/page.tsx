import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: "Use cases — what teams actually do with LIT",
  description:
    "Outbound prospecting, account expansion, supplier discovery, lane intelligence, market sizing — the real workflows revenue teams run on LIT.",
  path: "/use-cases",
  eyebrow: "Use Cases",
});

const INDEX = groq`*[_type == "useCase"] | order(displayOrder asc, name asc){
  _id, name, slug, tagline, persona, primaryOutcome
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

      {items.length === 0 ? (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">No use cases yet</div>
              <p className="font-body mx-auto mt-2 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
                Add use cases from <code className="font-mono">/studio</code>.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {items.map((u) => (
                <Link
                  key={u._id}
                  href={`/use-cases/${u.slug?.current}`}
                  className="group flex flex-col rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                >
                  {u.persona && (
                    <div className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-brand-blue">
                      For {u.persona}
                    </div>
                  )}
                  <h3 className="display-sm mt-2">{u.name}</h3>
                  {u.tagline && (
                    <p className="font-body mt-2 flex-1 text-[14px] leading-relaxed text-ink-500">
                      {u.tagline}
                    </p>
                  )}
                  {u.primaryOutcome && (
                    <div className="font-body mt-4 rounded-lg bg-ink-25 px-3 py-2 text-[12.5px] text-ink-700">
                      <span className="font-display font-bold uppercase tracking-wider text-ink-500">Outcome:</span>{" "}
                      {u.primaryOutcome}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner
        eyebrow="See it in your stack"
        title="Pick a use case, see it live."
        subtitle="In a 30-min demo we walk through the use case that maps to your team — with your data, your accounts, your lanes."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "View pricing", href: "/pricing" }}
      />
    </PageShell>
  );
}
