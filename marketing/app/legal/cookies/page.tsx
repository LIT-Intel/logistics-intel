import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Cookie policy | Logistic Intel",
  description:
    "How Logistic Intel uses cookies and similar technologies. Essential, functional, analytics, and advertising cookies — and how you control them.",
  path: "/legal/cookies",
  eyebrow: "Legal",
});

const LAST_UPDATED = "2026-05-30";

type CookieRow = {
  pattern: string;
  purpose: string;
  type: "Essential" | "Functional" | "Analytics" | "Advertising";
  duration: string;
};

const COOKIE_TABLE: CookieRow[] = [
  {
    pattern: "sb-* (e.g. sb-access-token, sb-refresh-token)",
    purpose: "Supabase authentication and session — required to keep you signed in to app.logisticintel.com.",
    type: "Essential",
    duration: "Session to 1 year",
  },
  {
    pattern: "lit_* preference cookies",
    purpose: "Remember UI preferences (e.g. last workspace, dismissed banners, theme).",
    type: "Functional",
    duration: "Up to 1 year",
  },
  {
    pattern: "plausible_ignore",
    purpose: "Plausible Analytics opt-out flag for internal staff and Do Not Track respect.",
    type: "Functional",
    duration: "Persistent",
  },
  {
    pattern: "_li_*, lidc, bcookie, UserMatchHistory",
    purpose: "LinkedIn Insight Tag — measures ad campaign performance and enables conversion reporting on logisticintel.com.",
    type: "Advertising",
    duration: "Up to 2 years",
  },
];

const THIRD_PARTIES = [
  {
    name: "Plausible Analytics",
    role: "Privacy-friendly, cookieless-by-default analytics on the marketing site. No personal data, no cross-site tracking.",
    href: "https://plausible.io/privacy-focused-web-analytics",
  },
  {
    name: "LinkedIn Insight Tag",
    role: "Conversion measurement and audience building for LinkedIn ad campaigns. Loads only on marketing pages.",
    href: "https://www.linkedin.com/legal/privacy-policy",
  },
];

export default function CookiePolicyPage() {
  return (
    <PageShell>
      <PageHero eyebrow="Legal" title="Cookie policy" subtitle={`Last updated · ${LAST_UPDATED}`} />

      <section className="px-5 sm:px-8 pb-12">
        <article className="mx-auto max-w-[760px] space-y-6 font-body text-[16px] leading-[1.7] text-ink-700">
          <p>
            This policy explains how Logistic Intel, Inc. ("LIT", "we") uses cookies and similar
            technologies on logisticintel.com and app.logisticintel.com. It sits alongside our{" "}
            <a href="/legal/privacy" className="text-brand-blue underline">
              privacy policy
            </a>{" "}
            and{" "}
            <a href="/legal/terms" className="text-brand-blue underline">
              terms of service
            </a>
            .
          </p>

          <Section title="What cookies are">
            <p>
              Cookies are small text files a website stores in your browser. They let a site remember
              things between page loads — for example, that you're signed in, what plan your workspace
              is on, or which onboarding step you finished last week. We also use a few related
              technologies (localStorage, sessionStorage, web beacons) for the same purposes, and we
              treat them together in this policy.
            </p>
          </Section>

          <Section title="How we use cookies">
            <p>We group cookies into four categories:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong className="text-ink-900">Essential.</strong> Authentication, session, and
                CSRF protection. Without these, you can't sign in or use the product.
              </li>
              <li>
                <strong className="text-ink-900">Functional.</strong> Remember your preferences —
                last-used workspace, dismissed prompts, language. These improve the experience but
                aren't strictly required.
              </li>
              <li>
                <strong className="text-ink-900">Analytics.</strong> Aggregated usage statistics so
                we can see which pages and features matter. We use{" "}
                <a
                  href="https://plausible.io/privacy-focused-web-analytics"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-blue underline"
                >
                  Plausible Analytics
                </a>
                , which does not set cross-site tracking cookies and does not collect personal data.
              </li>
              <li>
                <strong className="text-ink-900">Advertising.</strong> The LinkedIn Insight Tag runs
                on our marketing pages so we can measure the performance of LinkedIn campaigns and
                reach relevant audiences. It does not run inside the product.
              </li>
            </ul>
          </Section>

          <Section title="Types of cookies we set">
            <p>
              The table below describes the cookies most commonly set when you visit our sites.
              Specific names and durations can change as vendors update their SDKs; treat this as a
              representative list rather than an exhaustive snapshot.
            </p>
          </Section>
        </article>
      </section>

      <section className="px-5 sm:px-8 pb-12">
        <div className="mx-auto max-w-[820px]">
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-25 text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="font-display px-5 py-3 font-bold">Cookie / pattern</th>
                  <th className="font-display px-5 py-3 font-bold">Purpose</th>
                  <th className="font-display px-5 py-3 font-bold">Type</th>
                  <th className="font-display px-5 py-3 font-bold">Duration</th>
                </tr>
              </thead>
              <tbody>
                {COOKIE_TABLE.map((row) => (
                  <tr key={row.pattern} className="border-b border-ink-100 last:border-0 align-top">
                    <td className="font-display px-5 py-3 text-[13.5px] font-semibold text-ink-900">
                      {row.pattern}
                    </td>
                    <td className="font-body px-5 py-3 text-[13.5px] text-ink-700">{row.purpose}</td>
                    <td className="font-body px-5 py-3 text-[13.5px] text-ink-700">{row.type}</td>
                    <td className="font-body px-5 py-3 text-[13.5px] text-ink-500">{row.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="px-5 sm:px-8 pb-12">
        <article className="mx-auto max-w-[760px] space-y-6 font-body text-[16px] leading-[1.7] text-ink-700">
          <Section title="Third-party cookies">
            <p>
              A small number of partners may set cookies on our marketing site. We only work with
              vendors that have a published privacy policy and that we've listed as a sub-processor
              where customer data is involved.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {THIRD_PARTIES.map((p) => (
                <li key={p.name}>
                  <strong className="text-ink-900">{p.name}.</strong> {p.role}{" "}
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-blue underline"
                  >
                    Privacy policy
                  </a>
                  .
                </li>
              ))}
            </ul>
            <p className="mt-3">
              See our full sub-processor list on the{" "}
              <a href="/legal/dpa" className="text-brand-blue underline">
                data processing addendum
              </a>{" "}
              page.
            </p>
          </Section>

          <Section title="How to control cookies">
            <p>
              You can control or delete cookies at the browser level. The links below take you to
              each vendor's current instructions:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>
                <a
                  href="https://support.google.com/chrome/answer/95647"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-blue underline"
                >
                  Google Chrome
                </a>
              </li>
              <li>
                <a
                  href="https://support.apple.com/en-us/HT201265"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-blue underline"
                >
                  Safari (macOS and iOS)
                </a>
              </li>
              <li>
                <a
                  href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-blue underline"
                >
                  Mozilla Firefox
                </a>
              </li>
              <li>
                <a
                  href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-blue underline"
                >
                  Microsoft Edge
                </a>
              </li>
            </ul>
            <p className="mt-3">
              Blocking essential cookies will break sign-in and most product functionality. Blocking
              analytics or advertising cookies has no effect on access to the product.
            </p>
            <p>
              We respect the <strong className="text-ink-900">Do Not Track</strong> (DNT) browser
              signal where it's sent: when DNT is on, we suppress non-essential analytics and
              advertising cookies for that session. We also honor the Global Privacy Control (GPC)
              signal as a "do not sell or share" request under the CCPA — though we do not sell
              personal data in any case.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy as the product, our vendor mix, or the law changes. The
              "Last updated" date at the top of the page always reflects the current version. For
              material changes, we'll surface an in-app banner and email workspace admins at least
              14 days before they take effect.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about this policy or about how we use cookies? Email{" "}
              <a href="mailto:privacy@logisticintel.com" className="text-brand-blue underline">
                privacy@logisticintel.com
              </a>{" "}
              or use our{" "}
              <a href="/contact" className="text-brand-blue underline">
                contact page
              </a>
              .
            </p>
          </Section>
        </article>
      </section>

      <section className="px-5 sm:px-8 pb-20">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl border border-ink-100 bg-ink-25 px-6 py-5 text-[12px] uppercase tracking-[0.08em] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-blue" aria-hidden />
            SOC&nbsp;2
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-blue" aria-hidden />
            GDPR
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-blue" aria-hidden />
            CCPA
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-blue" aria-hidden />
            ePrivacy
          </span>
        </div>
      </section>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display mt-8 mb-2 text-[20px] font-semibold tracking-[-0.015em] text-ink-900">
        {title}
      </h2>
      {children}
    </div>
  );
}
