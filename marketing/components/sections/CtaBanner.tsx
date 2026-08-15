import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Bottom-of-page CTA — calm conversion surface shared with the homepage.
 * Default copy comes from siteSettings.ctaCopy when caller doesn't override.
 */
export function CtaBanner({
  eyebrow = "Get Started",
  title = "See LIT in action.",
  subtitle = "Book a 30-minute demo with the team. We'll show you the platform live with your accounts.",
  primaryCta = { label: "Book a Demo", href: "/demo", icon: "calendar" as "calendar" | "arrow" },
  secondaryCta,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  primaryCta?: { label: string; href: string; icon?: "calendar" | "arrow" };
  secondaryCta?: { label: string; href: string };
}) {
  const PrimaryIcon = primaryCta.icon === "calendar" ? Calendar : ArrowRight;
  return (
    <section className="px-5 sm:px-8 py-12 sm:py-20">
      <div className="mx-auto max-w-container">
        <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 via-cyan-50 to-slate-50 px-7 py-10 shadow-[0_28px_80px_-50px_rgba(15,23,42,.5)] sm:px-10 sm:py-12 lg:px-12">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full opacity-50"
            style={{ background: "radial-gradient(circle, rgba(34,211,238,0.26), transparent 70%)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -left-24 h-72 w-72 rounded-full opacity-25"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%)" }}
          />
          <div className="relative max-w-[720px]">
            <div className="eyebrow">{eyebrow}</div>
            <h2 className="font-display mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.025em] text-ink-900 sm:text-[40px]">
              {title}
            </h2>
            {subtitle && (
              <p className="font-body mt-4 max-w-[590px] text-[15px] leading-relaxed text-ink-500 sm:text-[16px]">
                {subtitle}
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="lg"
                href={primaryCta.href}
                className="shadow-[0_6px_18px_rgba(37,99,235,0.45)] hover:shadow-[0_10px_24px_rgba(37,99,235,0.55)]"
              >
                <PrimaryIcon className="h-4 w-4" />
                {primaryCta.label}
              </Button>
              {secondaryCta && (
                <Button
                  variant="secondary"
                  size="lg"
                  href={secondaryCta.href}
                  className="border-ink-100 bg-white text-ink-900 shadow-sm hover:border-blue-200 hover:bg-white"
                >
                  {secondaryCta.label}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
