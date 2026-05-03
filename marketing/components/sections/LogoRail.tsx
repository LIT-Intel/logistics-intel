import Image from "next/image";
import { resolveLogoUrl } from "@/lib/sanityImage";

type Logo = { _id?: string; name: string; domain?: string | null; logo?: any; url?: string };

/**
 * Logo rail — desaturated by default with a brand hover accent. Resolves
 * each logo via Sanity first then falls back to logo.dev so brand-new
 * customers can be added with just a domain.
 */
export function LogoRail({
  eyebrow = "Trusted by revenue teams at",
  logos,
}: {
  eyebrow?: string;
  logos: Logo[];
}) {
  if (!logos?.length) return null;
  return (
    <section className="px-8 py-12">
      <div className="mx-auto max-w-container">
        <div className="font-display mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-200">
          {eyebrow}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-70 grayscale transition-all hover:opacity-100 hover:grayscale-0">
          {logos.map((l) => {
            const src = resolveLogoUrl({ logo: l.logo, domain: l.domain }, 160);
            if (!src) return null;
            return (
              <div key={l._id || l.name} className="relative h-7 w-28">
                <Image
                  src={src}
                  alt={l.name}
                  fill
                  sizes="112px"
                  className="object-contain"
                  unoptimized={src.includes("img.logo.dev")}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
