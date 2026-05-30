type Stat = {
  /** Small caps eyebrow above the number. E.g. "U.S. IMPORTS". */
  eyebrow: string;
  /** The headline number itself. Keep short — clamps from 64px → 96px. */
  value: string;
  /** Sub-label describing what the number represents. */
  label: string;
};

type BigNumberStripProps = {
  /** Exactly three stats. The tuple type makes "forgot one" a compile
   *  error — the strip is designed as a 3-up grid. */
  stats: [Stat, Stat, Stat];
  className?: string;
};

/**
 * Dark full-width "big number proof strip" — three typographic anchors
 * between the hero and the first content section.
 *
 * Honesty constraint: don't fabricate specifics. Numbers should be
 * directional or sourced. The home defaults (U.S. imports volume, lane
 * coverage, refresh cadence) are intentionally directional rather than
 * making product-level claims like "26M B/Ls indexed".
 */
export function BigNumberStrip({ stats, className }: BigNumberStripProps) {
  return (
    <section
      aria-label="Trade intelligence at a glance"
      className={[
        "relative overflow-hidden bg-dark-0 text-white",
        className || "",
      ].join(" ")}
    >
      {/* Ambient cyan/blue wash — matches the hero's gradient palette so
       *  the eye reads hero + strip as one continuous dark band. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(800px 360px at 50% 0%, rgba(0,240,255,0.08), transparent 65%), radial-gradient(700px 340px at 50% 100%, rgba(59,130,246,0.07), transparent 65%)",
        }}
      />

      <div className="relative mx-auto max-w-container px-6 py-20 md:py-24">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          {stats.map((s, i) => (
            <div
              key={s.eyebrow}
              className={[
                "flex flex-col items-start",
                // First card has no left divider on desktop / no top
                // divider on mobile. Divider rules flip with breakpoint.
                i === 0 ? "" : "md:border-l md:border-white/10 md:pl-8",
                i === 0 ? "" : "border-t border-white/10 pt-12 md:border-t-0 md:pt-0",
              ].join(" ")}
            >
              <div className="lit-eyebrow-dark">{s.eyebrow}</div>
              <div
                className="font-mono font-bold tracking-tight text-white mt-4 leading-none"
                style={{ fontSize: "clamp(64px, 8vw, 96px)" }}
              >
                {s.value}
              </div>
              <div className="text-white/70 text-[14px] mt-5 max-w-[280px] leading-relaxed">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Default home-page stats. Exported so the home page can opt into the
 * canonical set without re-typing the directional numbers.
 *
 * - Stat 1: U.S. imports volume. Directional ($3.2T) — based on Census
 *   trade flow estimates we're cleared to cite.
 * - Stat 2: Lane coverage. Directional ("50+ top lanes") — not a
 *   product-specific BOL count.
 * - Stat 3: Refresh cadence. Categorical ("Daily") — verifiable from
 *   our customs ingestion schedule.
 */
export const HOME_BIG_NUMBER_DEFAULTS: [Stat, Stat, Stat] = [
  {
    eyebrow: "U.S. IMPORTS",
    value: "$3.2T",
    label: "U.S. annual goods import flow tracked",
  },
  {
    eyebrow: "LANE COVERAGE",
    value: "50+",
    label:
      "Top trade lanes seeded across Trans-Pacific, Atlantic, and LATAM",
  },
  {
    eyebrow: "REFRESH",
    value: "Daily",
    label: "Customs manifest data, refreshed every business day",
  },
];
