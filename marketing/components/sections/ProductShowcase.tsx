import { OverlinePill } from "./OverlinePill";

export type ProductShowcaseCallout = {
  kpi: string;
  label: string;
};

/**
 * `ProductShowcase` — dark full-bleed section anchored on a single
 * Mac-chrome browser frame, tilted 2° on Y for depth, with three
 * absolutely-positioned `.ps-callout` chips pulling out key product
 * KPIs. Cyan is permitted here because the surface is dark.
 *
 * Until screenshots clear PII review, the frame renders a CSS-only
 * grid + monospace "pending PII review" note via `framePlaceholder`.
 * To use a real screenshot, pass `frameUrl` (and remove the
 * placeholder by passing `framePlaceholder={undefined}`).
 */
export function ProductShowcase({
  eyebrow,
  heading,
  lede,
  callouts,
  frameUrl,
  frameAlt,
  framePlaceholder = "pending-pii",
  urlBarText = "app.logisticintel.com / preview",
}: {
  eyebrow: string;
  heading: string;
  lede?: string;
  callouts: ProductShowcaseCallout[];
  frameUrl?: string;
  frameAlt?: string;
  framePlaceholder?: "pending-pii" | undefined;
  urlBarText?: string;
}) {
  const showPlaceholder = !frameUrl && framePlaceholder === "pending-pii";
  return (
    <section className="product-showcase">
      <div className="relative z-10 mx-auto max-w-container px-5 sm:px-8 text-center">
        <OverlinePill variant="cyan-on-dark">{eyebrow}</OverlinePill>
        <h2
          className="font-display mx-auto mt-4 max-w-[820px] text-balance font-bold leading-[1.06] tracking-[-0.03em] text-white"
          style={{ fontSize: "clamp(32px, 4vw, 52px)" }}
        >
          {heading}
        </h2>
        {lede && (
          <p className="mx-auto mt-5 max-w-[640px] text-[16px] leading-relaxed text-white/70">
            {lede}
          </p>
        )}

        <div className="ps-stage">
          <div className="ps-frame">
            <div className="ps-chrome">
              <span className="ps-dot" style={{ background: "#ff5f57" }} />
              <span className="ps-dot" style={{ background: "#febc2e" }} />
              <span className="ps-dot" style={{ background: "#28c840" }} />
              <span className="ps-url">{urlBarText}</span>
            </div>
            <div
              className={`ps-image${showPlaceholder ? " placeholder" : ""}`}
              role={showPlaceholder ? "img" : undefined}
              aria-label={
                showPlaceholder ? "Product preview · pending PII review" : undefined
              }
              style={
                frameUrl
                  ? {
                      backgroundImage: `url(${frameUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "top center",
                    }
                  : undefined
              }
              aria-hidden={!showPlaceholder && !frameAlt}
            />

            {callouts.slice(0, 3).map((c, i) => (
              <div
                key={i}
                className={`ps-callout c${i + 1}`}
                aria-hidden="true"
              >
                <span className="pc-kpi">{c.kpi}</span>
                <span className="pc-label">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
