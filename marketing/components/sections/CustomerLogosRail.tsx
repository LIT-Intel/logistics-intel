import { logoDevUrl } from "@/lib/sanityImage";
import { LogoImage } from "./LogoImage";

/**
 * Customer logos — infinite-scroll marquee. Logos render twice and the
 * track translates -50% over 45s so the seam is invisible. Edge fades
 * mask the entry/exit. Pauses on hover (desktop) and on
 * prefers-reduced-motion (handled globally in globals.css).
 *
 * Each logo tries logo.dev first; LogoImage falls back to a colored
 * monogram tile if the URL errors or no domain resolves.
 */

type Logo = { domain?: string | null; name: string };

const PLACEHOLDERS: Logo[] = [
  { name: "OceanLink Logistics" },
  { name: "Harbor & Co Freight" },
  { name: "Atlas Trade Group" },
  { name: "Pacific Bridge Corp" },
  { name: "Continental Movers" },
  { name: "Meridian Supply Co" },
  { name: "Voltcell Industries" },
  { name: "Northstar Energy" },
];

export function CustomerLogosRail({
  eyebrow = "Built for the revenue teams running freight at companies like",
  logos,
  className = "",
}: {
  eyebrow?: string;
  logos?: Logo[];
  className?: string;
}) {
  const list = (logos && logos.length ? logos : PLACEHOLDERS).slice(0, 12);
  const doubled = [...list, ...list];

  return (
    <section className={`py-12 ${className}`}>
      <div className="mx-auto max-w-container px-6 sm:px-8">
        <div className="font-display mb-8 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-200">
          {eyebrow}
        </div>
      </div>

      <div className="relative overflow-hidden">
        {/* Edge fades — match the page wash so logos feather in/out. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-24"
          style={{ background: "linear-gradient(to right, #fbfcfe, transparent)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-24"
          style={{ background: "linear-gradient(to left, #fbfcfe, transparent)" }}
        />

        <div className="lit-marquee flex w-max items-center gap-10 sm:gap-14 md:gap-16">
          {doubled.map((l, i) => {
            const src = l.domain ? logoDevUrl(l.domain, { size: 200 }) : null;
            const isClone = i >= list.length;
            return (
              <div
                key={`${l.name}-${i}`}
                className="flex h-10 shrink-0 items-center justify-center"
                aria-hidden={isClone || undefined}
              >
                <LogoImage src={src} domain={l.domain} name={l.name} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
