import Link from "next/link";
import Image from "next/image";
import { groq } from "next-sanity";
import { ArrowRight } from "lucide-react";
import { sanityClient } from "@/sanity/lib/client";
import { imgUrl } from "@/lib/sanityImage";

type FeaturedReport = {
  headline?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  coverImage?: any;
  active?: boolean;
};

const FEATURED_REPORT_QUERY = groq`*[_type == "featuredReport"][0]{
  headline, body, ctaLabel, ctaUrl, coverImage, active
}`;

/**
 * `ReportPromoBanner` — full-width lead-magnet band inserted between the
 * first row of blog cards and the rest of the grid. Backed by a Sanity
 * singleton (`featuredReport`). Returns `null` whenever the singleton is
 * missing, the `active` flag is false, or required fields are blank —
 * which keeps the surface safely invisible until an editor publishes a
 * report.
 */
export async function ReportPromoBanner() {
  const report = await sanityClient
    .fetch<FeaturedReport | null>(FEATURED_REPORT_QUERY)
    .catch(() => null);

  if (!report || report.active !== true) return null;
  if (!report.headline || !report.ctaUrl) return null;

  const coverSrc = imgUrl(report.coverImage, { width: 1200 }) || null;
  const ctaLabel = report.ctaLabel || "Download report";

  return (
    <section className="px-5 sm:px-8">
      <div className="mx-auto max-w-content">
        <div
          className="grid grid-cols-1 items-center gap-6 overflow-hidden rounded-2xl border border-ink-100 p-6 sm:gap-8 sm:p-8 lg:grid-cols-[1.15fr_0.85fr]"
          style={{ background: "#F8F9FF" }}
        >
          {/* Left — copy + CTA */}
          <div className="flex flex-col items-start gap-4">
            <div className="font-mono inline-flex items-center rounded-[4px] bg-ink-900 px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
              [report]
            </div>
            <h2
              className="font-display font-semibold leading-[1.15] tracking-[-0.018em] text-ink-900"
              style={{ fontSize: "clamp(22px, 2.4vw, 28px)" }}
            >
              {report.headline}
            </h2>
            {report.body && (
              <p className="font-body max-w-[520px] text-[15px] leading-relaxed text-ink-500">
                {report.body}
              </p>
            )}
            <Link
              href={report.ctaUrl}
              className="font-display mt-1 inline-flex h-11 items-center gap-2 rounded-xl bg-[#0F172A] px-5 text-[14px] font-semibold text-white shadow-[0_6px_16px_rgba(15,23,42,0.25)] transition hover:bg-[#1E293B]"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Right — cover image 3:2 */}
          <div className="w-full">
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-ink-25">
              {coverSrc ? (
                <Image
                  src={coverSrc}
                  alt={report.headline}
                  fill
                  sizes="(min-width: 1024px) 460px, 100vw"
                  className="object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
