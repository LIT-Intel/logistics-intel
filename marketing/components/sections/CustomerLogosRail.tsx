import { logoDevUrl } from "@/lib/sanityImage";
import { LogoImage } from "./LogoImage";

/**
 * Customer logos rail — robust against missing logo.dev key.
 *
 * Each logo tries logo.dev first (with key), falls back to a colored
 * monogram tile via LogoImage if the image errors or no src resolves.
 * The rail always renders something readable and on-brand.
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
  const list = (logos && logos.length ? logos : PLACEHOLDERS).slice(0, 10);

  return (
    <section className={`px-6 py-12 sm:px-8 ${className}`}>
      <div className="mx-auto max-w-container">
        <div className="font-display mb-7 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-200">
          {eyebrow}
        </div>
        <div className="grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-7 sm:grid-cols-3 md:grid-cols-5">
          {list.map((l, i) => {
            const src = l.domain ? logoDevUrl(l.domain, { size: 200 }) : null;
            return (
              <div key={`${l.name}-${i}`} className="flex min-h-[36px] items-center justify-center">
                <LogoImage src={src} name={l.name} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
