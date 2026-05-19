import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Briefcase,
  Crown,
  Handshake,
  LinkIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { LeadMagnetHero } from "@/components/lead-magnet/LeadMagnetHero";
import { LiveProductPreview } from "@/components/lead-magnet/LiveProductPreview";
import { ProofStrip } from "@/components/lead-magnet/ProofStrip";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { PartnerApplicationForm } from "@/components/sections/PartnerApplicationForm";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Partner program — earn 15% recurring commission referring freight teams to LIT",
  description:
    "Earn 15% recurring commission, for life, when you refer freight teams to LIT. Help operators move off ZoomInfo, ImportGenius, and Apollo. Built for freight consultants, broker networks, agencies, and logistics creators.",
  path: "/partners",
  eyebrow: "Partner program",
});

const PROGRAM_STEPS = [
  {
    step: "01",
    title: "Apply & get approved",
    body: "Tell us about your audience or network. Most applications are approved within 48 hours.",
    icon: BadgeCheck,
  },
  {
    step: "02",
    title: "Share your link",
    body: "Get a custom partner link, branded landing pages, and co-branded demo collateral on day one.",
    icon: LinkIcon,
  },
  {
    step: "03",
    title: "Earn 15% recurring",
    body: "15% of every paid invoice — for life. Paid monthly via Stripe. Real-time dashboard with live referral tracking.",
    icon: Banknote,
  },
  {
    step: "T2",
    title: "Power partners: 25% recurring after 10 customers",
    body: "Hit 10 active paying customers and your commission bumps to 25% on every subscription — including the existing ones.",
    icon: TrendingUp,
  },
  {
    step: "T3",
    title: "Strategic: custom revenue share",
    body: "Bring an enterprise account? We'll structure a deal. Common for industry consultants and freight associations.",
    icon: Crown,
  },
  {
    step: "$0",
    title: "No cost. No quotas. No co-selling.",
    body: "No application fee, no minimums, no quarterly numbers to hit. Just refer anyone who would benefit from LIT.",
    icon: Sparkles,
  },
];

export default function PartnersPage() {
  return (
    <>
      <StickyCTABar />
      <MoneyPageShell>

      <LeadMagnetHero
        eyebrow="Partner program · Now open"
        headline={
          <>
            Earn <em>15% recurring</em> referring freight teams to LIT.
          </>
        }
        lede="Help the freight community move off ZoomInfo, ImportGenius, and Apollo. Get paid every month for every customer who stays. Built for freight consultants, broker networks, agencies, and content creators in logistics."
        ctaLabel="Apply now →"
        formSource="partners-hero"
        formNote="Applications reviewed within 48 hours. Open to freight + GTM operators worldwide."
      >
        <LiveProductPreview
          urlBarText="partners.logisticintel.com / dashboard"
          pulseLabel="LIVE"
        >
          <div className="space-y-3">
            {/* Top stats row — sample MRR scaled to the 15% commission tier */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">
                  Your MRR (this month)
                </div>
                <div className="font-display mt-1 text-[20px] font-bold text-brand-cyan">
                  $786 / mo
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/45">
                  +$118 vs last month
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">
                  Active customers
                </div>
                <div className="font-display mt-1 text-[20px] font-bold text-white">
                  7
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/45">
                  3 to power-partner tier
                </div>
              </div>
            </div>

            {/* Referred customer rows — MRR figures are 15% of customer subscription */}
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div>
                  <div className="font-display text-[13px] font-semibold text-white">
                    Meridian Freight Group
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/50">
                    Growth · 8 seats · since Mar 2026
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-brand-cyan">
                  $236 / mo
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div>
                  <div className="font-display text-[13px] font-semibold text-white">
                    Pacific Lane Logistics
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/50">
                    Starter · 3 seats · since Apr 2026
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-brand-cyan">
                  $74 / mo
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div>
                  <div className="font-display text-[13px] font-semibold text-white">
                    Allegro Trade Co.
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/50">
                    Scale · 14 seats · since Jan 2026
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-brand-cyan">
                  $359 / mo
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div>
                  <div className="font-display text-[13px] font-semibold text-white">
                    Tradewind Brokerage
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-white/50">
                    Growth · 5 seats · since Feb 2026
                  </div>
                </div>
                <span className="font-mono text-[11px] font-bold text-brand-cyan">
                  $117 / mo
                </span>
              </div>
            </div>
          </div>
        </LiveProductPreview>
      </LeadMagnetHero>

      {/* Partner-specific trust row (Option C — sits between hero and ProofStrip
          so we don't have to edit the shared LeadMagnetHero default trust row). */}
      <section className="bg-dark-0">
        <div className="mx-auto flex max-w-container flex-wrap items-center justify-center gap-x-10 gap-y-4 border-t border-white/5 px-4 py-6 text-center text-xs text-white/70 sm:px-6">
          <span className="inline-flex items-center gap-2">
            <Banknote className="h-3.5 w-3.5 text-brand-cyan" aria-hidden />
            <strong className="font-semibold text-white">15%</strong> recurring · for life
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-cyan" aria-hidden />
            <strong className="font-semibold text-white">$0</strong> to join
          </span>
          <span className="inline-flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-brand-cyan" aria-hidden />
            <strong className="font-semibold text-white">90-day</strong> cookie attribution
          </span>
        </div>
      </section>

      <ProofStrip />

      {/* How the program works — 6-card grid */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-4 py-20 sm:px-6 lg:py-24">
          <header className="mb-12 max-w-[720px]">
            <div className="eyebrow">How the program works</div>
            <h2 className="display-md space-eyebrow-h1">
              Sign up. Share your link. Get paid.
            </h2>
            <p className="font-body mt-4 text-[15px] leading-relaxed text-ink-700">
              No quotas. No co-selling required. Just refer anyone who would benefit from LIT
              and get 15% of their subscription, every month, as long as they stay.
            </p>
          </header>

          <ol className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PROGRAM_STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.step}
                  className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
                >
                  <div
                    className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-brand-blue-700" aria-hidden />
                  </div>
                  <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-blue-700">
                    {s.step}
                  </div>
                  <div className="font-display mt-1 text-[16px] font-semibold text-ink-900">
                    {s.title}
                  </div>
                  <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">
                    {s.body}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <OutcomesBand
        items={[
          {
            num: "15%",
            label: "Recurring commission",
            body: "On every subscription. Every month. For as long as they remain a paying customer. No caps.",
          },
          {
            num: "90 days",
            label: "Cookie attribution",
            body: "Long attribution window. If they sign up within 90 days of clicking your link, you get credit — even if they sign up months later.",
          },
          {
            num: "$0",
            label: "Cost to join",
            body: "No application fee. No minimums. No quotas. The only thing you bring is your network.",
          },
        ]}
      />

      {/* Final CTA — apply now */}
      <section id="apply" className="bg-white">
        <div className="mx-auto max-w-container px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <div className="lit-pill">
                <span className="dot" />
                Apply now · 48-hour review
              </div>
              <h2 className="display-md space-eyebrow-h1 max-w-[520px]">
                Build a freight intelligence revenue line — in 48 hours.
              </h2>
              <p className="font-body mt-4 max-w-[520px] text-[15px] leading-relaxed text-ink-700">
                Apply now. Most partners are approved within 2 business days and earning within
                a week. We respond either way — approvals come with the welcome kit and your
                tracked link.
              </p>
              <div className="mt-8 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
                <div className="font-display flex items-center gap-2 text-[12.5px] font-semibold text-ink-900">
                  <Briefcase className="h-4 w-4 text-brand-blue-700" aria-hidden />
                  Prefer email first?
                </div>
                <p className="font-body mt-1 text-[13px] leading-snug text-ink-500">
                  Reach the partnerships team directly at{" "}
                  <a
                    href="mailto:partnerships@logisticintel.com"
                    className="font-medium text-brand-blue underline"
                  >
                    partnerships@logisticintel.com
                  </a>
                  .
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.18)] sm:p-8">
              <div className="mb-5">
                <div className="font-display flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-200">
                  <Handshake className="h-3.5 w-3.5" />
                  Partner application
                </div>
                <h3 className="font-display mt-2 text-[20px] font-semibold tracking-[-0.015em] text-ink-900">
                  Apply to the partner program
                </h3>
                <p className="font-body mt-1 text-[13px] leading-snug text-ink-500">
                  We respond within 48 hours. Required fields marked with *.
                </p>
              </div>
              {/* Hidden source tag rendered ahead of the form for analytics
                  parity with the hero (PartnerApplicationForm itself reads
                  UTM/referrer client-side and overrides `source`). */}
              <input type="hidden" name="source" value="partners-final" />
              <PartnerApplicationForm />
              <p className="font-body mt-4 inline-flex items-center gap-1 text-[11px] text-ink-200">
                <ArrowRight className="h-3 w-3" aria-hidden />
                Earning within a week of approval.
              </p>
            </div>
          </div>
        </div>
      </section>

      </MoneyPageShell>
      <ExitIntentModal />
    </>
  );
}
