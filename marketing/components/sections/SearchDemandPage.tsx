import Link from "next/link";
import { ArrowRight, CheckCircle2, Database, Search, Workflow } from "lucide-react";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { siteUrl } from "@/lib/seo";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { CtaBanner } from "./CtaBanner";
import { CrmPipelinePreview } from "./CrmPipelinePreview";
import { PageShell } from "./PageShell";

export type SearchDemandPageData = {
  slug: string;
  eyebrow: string;
  title: string;
  intro: string;
  definition: string;
  capabilities: { title: string; body: string }[];
  workflow: { title: string; body: string }[];
  faqs: { question: string; answer: string }[];
  related: { href: string; label: string; body: string }[];
  productPreview?: "crm";
};

export function SearchDemandPage({ page }: { page: SearchDemandPageData }) {
  const hasProductPreview = page.productPreview === "crm";
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    url: siteUrl(`/${page.slug}`),
    description: page.intro,
    about: { "@id": `${siteUrl("")}/#organization` },
    isPartOf: { "@id": `${siteUrl("")}/#website` },
  };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbBar crumbs={[{ label: "Home", href: "/" }, { label: page.eyebrow }]} />

      <section className="relative overflow-hidden px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:pt-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(820px_460px_at_82%_14%,rgba(34,211,238,0.14),transparent_68%),radial-gradient(640px_380px_at_26%_0%,rgba(59,130,246,0.09),transparent_72%)]" />
        <div className={`mx-auto ${hasProductPreview ? "grid max-w-container items-center gap-12 lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] lg:gap-14" : "max-w-content text-center"}`}>
          <div className={hasProductPreview ? "max-w-[620px]" : ""}>
          <div className="lit-pill shadow-sm"><span className="dot" />{page.eyebrow}</div>
          <h1 className={`display-xl mt-5 ${hasProductPreview ? "max-w-[650px]" : "mx-auto max-w-[920px]"}`}>{page.title}</h1>
          <p className={`lead mt-6 ${hasProductPreview ? "max-w-[590px]" : "mx-auto max-w-[760px]"}`}>{page.intro}</p>
          <div className={`mt-8 flex flex-wrap gap-3 ${hasProductPreview ? "" : "justify-center"}`}>
            <Link href={APP_SIGNUP_URL} className="font-display inline-flex h-12 items-center gap-2 rounded-xl bg-blue-600 px-6 text-[14px] font-semibold text-white shadow-glow-blue transition hover:bg-blue-700">Start 7-day trial<ArrowRight className="h-4 w-4" /></Link>
            <Link href="/demo" className="font-display inline-flex h-12 items-center rounded-xl border border-ink-100 bg-white px-6 text-[14px] font-semibold text-ink-900 shadow-sm transition hover:shadow-md">Book a demo</Link>
          </div>
          <p className="font-body mt-4 text-[12.5px] text-ink-500">10 searches + 10 verified contacts. No credit card.</p>
          </div>
          {hasProductPreview && (
            <div className="relative min-w-0">
              <div className="absolute -inset-5 -z-10 rounded-[38px] bg-gradient-to-br from-cyan-200/35 via-blue-200/25 to-transparent blur-2xl" />
              <div className="overflow-hidden rounded-3xl border border-blue-100/80 bg-white/75 p-2 shadow-[0_30px_90px_-45px_rgba(15,23,42,.55)] backdrop-blur sm:p-3">
                <CrmPipelinePreview />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8">
        <div className="relative mx-auto grid max-w-content gap-7 overflow-hidden rounded-3xl border border-blue-100/80 bg-gradient-to-br from-white via-blue-50/45 to-cyan-50/55 p-7 shadow-[0_24px_70px_-48px_rgba(15,23,42,.5)] md:grid-cols-[0.8fr_1.2fr] md:p-10">
          <div><div className="eyebrow">The practical definition</div><h2 className="display-md mt-3">What the software should help your team accomplish.</h2></div>
          <p className="font-body text-[17px] leading-[1.75] text-ink-700">{page.definition}</p>
        </div>
      </section>

      <section className="bg-section-soft-blue px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-content">
          <div className="max-w-[680px]"><div className="eyebrow">Core capabilities</div><h2 className="display-lg mt-3">The context and controls to move an opportunity forward.</h2></div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {page.capabilities.map((item, index) => {
              const icons = [Database, Search, Workflow];
              const Icon = icons[index % icons.length];
              return <article key={item.title} className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white/85 p-6 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"><span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" /><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50"><Icon className="h-5 w-5 text-blue-700" /></span><h3 className="display-sm mt-5">{item.title}</h3><p className="font-body mt-3 text-[14px] leading-relaxed text-ink-500">{item.body}</p></article>;
            })}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-content">
          <div className="eyebrow text-cyan-300">From signal to action</div><h2 className="font-display mt-3 max-w-[720px] text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[46px]">A workflow built around the way freight sales teams actually work.</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {page.workflow.map((item, index) => <li key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.05] p-6"><div className="font-mono text-[11px] font-semibold text-cyan-300">0{index + 1}</div><h3 className="font-display mt-3 text-[18px] font-semibold">{item.title}</h3><p className="font-body mt-3 text-[13.5px] leading-relaxed text-slate-300">{item.body}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[900px]"><div className="text-center"><div className="eyebrow">Frequently asked</div><h2 className="display-lg mt-3">Questions freight teams ask.</h2></div><div className="mt-9 space-y-3">{page.faqs.map((faq) => <details key={faq.question} className="group rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"><summary className="font-display cursor-pointer list-none pr-6 text-[15px] font-semibold text-ink-900">{faq.question}</summary><p className="font-body mt-3 text-[14px] leading-relaxed text-ink-500">{faq.answer}</p></details>)}</div></div>
      </section>

      <section className="px-5 pb-16 sm:px-8"><div className="mx-auto max-w-content"><div className="eyebrow">Explore the platform</div><div className="mt-5 grid gap-4 md:grid-cols-3">{page.related.map((item) => <Link key={item.href} href={item.href} className="group rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><h3 className="font-display text-[15px] font-semibold text-ink-900">{item.label}</h3><ArrowRight className="h-4 w-4 text-blue-600 transition group-hover:translate-x-1" /></div><p className="font-body mt-2 text-[13px] leading-relaxed text-ink-500">{item.body}</p></Link>)}</div></div></section>

      <CtaBanner eyebrow="See it on your accounts" title="Start with ten real searches, not a sales deck." subtitle="Use the 7-day trial to research accounts your team already knows. No credit card required." primaryCta={{ label: "Start 7-day trial", href: APP_SIGNUP_URL, icon: "arrow" }} secondaryCta={{ label: "Book a demo", href: "/demo" }} />
    </PageShell>
  );
}
