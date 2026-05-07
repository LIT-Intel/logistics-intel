import Link from "next/link";
import { ArrowRight, Crown } from "lucide-react";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { HubCard } from "@/components/sections/HubCard";
import type { BestListPage } from "@/app/best/_data";

export function BestListPageTemplate({ data }: { data: BestListPage }) {
  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Best of", href: "/best" },
          { label: data.eyebrow },
        ]}
      />
      <PageHero
        eyebrow={data.eyebrow}
        title={data.title}
        subtitle={data.lede}
        primaryCta={{ label: "Try LIT free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <Section top="none" bottom="md">
        <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8 shadow-sm">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-brand-blue">
            Short answer
          </div>
          <p className="font-body mt-3 text-[16px] leading-relaxed text-ink-700">
            {data.shortAnswer}
          </p>
        </div>
      </Section>

      <Section top="md" bottom="md">
        <div className="rounded-2xl border border-ink-100 bg-ink-25 px-5 py-4 sm:px-6">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
            Methodology
          </div>
          <p className="font-body mt-1.5 text-[13.5px] leading-relaxed text-ink-700">
            {data.methodology}
          </p>
        </div>
      </Section>

      <Section top="md" bottom="md">
        <div className="space-y-4 sm:space-y-5">
          {data.entries.map((e) => {
            const isLeader = e.rank === 1;
            return (
              <div
                key={e.name}
                className={
                  "rounded-2xl border bg-white p-6 sm:p-8 shadow-sm transition " +
                  (isLeader
                    ? "border-brand-blue/40 shadow-md ring-1 ring-brand-blue/10"
                    : "border-ink-100")
                }
              >
                <div className="flex items-start gap-4 sm:gap-6">
                  <div
                    className={
                      "flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl font-display text-[16px] sm:text-[18px] font-bold " +
                      (isLeader ? "bg-brand-blue text-white" : "bg-ink-50 text-ink-700")
                    }
                  >
                    {isLeader ? <Crown className="h-5 w-5" aria-hidden /> : `#${e.rank}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                      <h2 className="font-display text-[20px] sm:text-[22px] font-semibold tracking-[-0.015em] text-ink-900">
                        {e.name}
                      </h2>
                      {isLeader && (
                        <span className="font-display rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-brand-blue-700">
                          Top pick
                        </span>
                      )}
                    </div>
                    <p className="font-body mt-2 text-[15px] leading-relaxed text-ink-700">{e.pitch}</p>
                    <div className="font-body mt-3 text-[13.5px] text-ink-500">
                      <span className="font-display font-semibold uppercase tracking-[0.08em] text-[11px] text-ink-700">When to pick:</span>{" "}
                      {e.whenToPick}
                    </div>
                    {(e.vsSlug || isLeader) && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {isLeader && (
                          <Link
                            href={APP_SIGNUP_URL}
                            className="font-display inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-blue-700"
                          >
                            Try LIT free <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        {e.vsSlug && (
                          <Link
                            href={`/vs/${e.vsSlug}`}
                            className="font-display inline-flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-4 py-2 text-[13px] font-semibold text-ink-700 transition hover:border-brand-blue/30 hover:text-brand-blue-700"
                          >
                            LIT vs {e.name} <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {data.related.length > 0 && (
        <Section top="md" bottom="lg">
          <div className="mb-6 sm:mb-8">
            <div className="eyebrow">Related</div>
            <h2 className="display-md mt-3">Keep digging.</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.related.map((r) => (
              <HubCard key={r.href} href={r.href} variant="compact" className="flex items-center justify-between">
                <span className="font-display text-[14.5px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                  {r.label}
                </span>
                <ArrowRight className="h-4 w-4 text-ink-200 group-hover:text-brand-blue" aria-hidden />
              </HubCard>
            ))}
          </div>
        </Section>
      )}

      <CtaBanner
        eyebrow="See it on your real lanes"
        title="Try the #1 pick free."
        subtitle="A 30-minute demo with your top 5 target accounts beats reading every list. We'll show you the signal on lanes you actually sell into."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: APP_SIGNUP_URL }}
      />
    </PageShell>
  );
}
