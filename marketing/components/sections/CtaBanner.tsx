import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Bottom-of-page CTA — Pulse Coach surface (slate gradient + cyan glow).
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
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 px-10 py-14 text-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)]"
          style={{
            background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
            boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18), 0 30px 80px -20px rgba(15,23,42,0.5)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full opacity-50"
            style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)" }}
          />
          <div className="relative max-w-[720px]">
            <div className="lit-eyebrow-dark">{eyebrow}</div>
            <h2 className="font-display mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em]">
              {title}
            </h2>
            {subtitle && (
              <p className="font-body mt-4 max-w-[560px] text-[16px] leading-relaxed text-ink-150">
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
                /* Dark-surface secondary: white/15 border + white/5 fill,
                   not the default light-surface secondary token. */
                <Button
                  variant="secondary"
                  size="lg"
                  href={secondaryCta.href}
                  className="border-white/15 bg-white/5 text-white backdrop-blur-0 hover:border-white/15 hover:bg-white/10"
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
