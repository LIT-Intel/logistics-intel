import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * `ReportCta` — dark gradient banner anchored by a CSS-built 3D PDF
 * mockup on the left and a glossy cyan CTA on the right. Cyan is
 * permitted because this lives on a dark surface.
 *
 * The PDF cover is a stylized placeholder; swap to a real cover image
 * when the 2026 trade report is finalized by overriding `.report-mockup`
 * background-image.
 */
export function ReportCta({
  eyebrow,
  heading,
  body,
  ctaLabel,
  ctaUrl,
  reportTitle,
  reportSubtitle,
  reportTag = "Trade Report 2026",
}: {
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  reportTitle: string;
  reportSubtitle?: string;
  reportTag?: string;
}) {
  return (
    <section className="px-5 sm:px-8 py-12 sm:py-20">
      <div className="mx-auto max-w-container">
        <div className="report-cta">
          <div className="relative flex justify-center">
            <div className="report-mockup">
              <span className="rm-spine" aria-hidden />
              <span className="rm-tag">{reportTag}</span>
              <span className="rm-title">{reportTitle}</span>
              {reportSubtitle && <span className="rm-sub">{reportSubtitle}</span>}
            </div>
          </div>
          <div className="relative">
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-brand-cyan">
              {eyebrow}
            </div>
            <h2 className="font-display mt-3 text-[clamp(26px,2.6vw,36px)] font-bold leading-[1.12] tracking-[-0.02em] text-white">
              {heading}
            </h2>
            <p className="mt-4 max-w-[480px] text-[15px] leading-relaxed text-white/70">
              {body}
            </p>
            <Link href={ctaUrl} className="rc-cta mt-6">
              {ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
