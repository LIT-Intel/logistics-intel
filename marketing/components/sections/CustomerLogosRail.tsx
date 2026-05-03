import Image from "next/image";
import { logoDevUrl } from "@/lib/sanityImage";

/**
 * Customer logos rail. Until you provide real customer domains, falls
 * back to a stylized "industry leaders" rail with sector-typical
 * importer brand monograms — clearly NOT real customers (no real
 * names) but visually conveys "real B2B outfit." When you hand me
 * 6-8 real customer domains, swap the LOGOS array and logo.dev
 * resolves all of them.
 *
 * Usage:
 *   // Real customer mode (when you have permission):
 *   <CustomerLogosRail logos={[
 *     { domain: "kubota.com", name: "Kubota" },
 *     { domain: "fedex.com",  name: "FedEx" },
 *     ...
 *   ]} />
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
  eyebrow = "Trusted by revenue teams across freight, freight forwarding, and B2B importers",
  logos,
  className = "",
}: {
  eyebrow?: string;
  logos?: Logo[];
  className?: string;
}) {
  const list = (logos && logos.length ? logos : PLACEHOLDERS).slice(0, 8);
  const hasReal = list.some((l) => l.domain);

  return (
    <section className={`px-8 py-14 ${className}`}>
      <div className="mx-auto max-w-container">
        <div className="font-display mb-7 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-200">
          {eyebrow}
        </div>
        <div
          className={`grid items-center gap-x-8 gap-y-5 sm:grid-cols-4 lg:grid-cols-8 ${
            hasReal ? "opacity-70 grayscale transition-all hover:opacity-100 hover:grayscale-0" : ""
          }`}
        >
          {list.map((l, i) => {
            if (l.domain) {
              const src = logoDevUrl(l.domain, { size: 200 });
              if (!src) return null;
              return (
                <div key={l.domain} className="relative mx-auto h-7 w-28">
                  <Image
                    src={src}
                    alt={l.name}
                    fill
                    sizes="112px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
              );
            }
            // Placeholder monogram tile
            return <PlaceholderTile key={i} name={l.name} />;
          })}
        </div>
        {!hasReal && (
          <p className="font-body mx-auto mt-5 max-w-[560px] text-center text-[11.5px] leading-snug text-ink-200">
            Logo rail awaiting real customer permissions. Send 6–8 customer domains to populate via logo.dev.
          </p>
        )}
      </div>
    </section>
  );
}

function PlaceholderTile({ name }: { name: string }) {
  // Generate a deterministic tint per name so the rail looks varied
  // but stable between renders.
  const tints = [
    "#3b82f6",
    "#06b6d4",
    "#10b981",
    "#8b5cf6",
    "#f59e0b",
    "#ec4899",
    "#0ea5e9",
    "#a855f7",
  ];
  const hash = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  const tint = tints[hash % tints.length];
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="mx-auto flex items-center gap-2.5">
      <div
        className="font-display flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-bold text-white"
        style={{ background: tint }}
      >
        {initials}
      </div>
      <div className="font-display whitespace-nowrap text-[12px] font-semibold tracking-[-0.01em] text-ink-700">
        {name}
      </div>
    </div>
  );
}
