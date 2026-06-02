import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Default alt text for the rendered card (used in ImageResponse + as a doc hint
// for consumers; not exported because Next.js route handlers reject unknown
// exports).
const CARD_ALT = "LIT Pulse Company Report — weekly supply-chain digest card";

/**
 * /api/og/pulse-digest
 *
 * next/og ImageResponse endpoint that renders the weekly LIT Pulse
 * Company Report Digest card for a single high-volume shipper.
 *
 * Pure render from URL params — no DB, no MCP, no Node APIs (edge
 * runtime). All copy + numbers come in via query string. The publish
 * pipeline (Sanity + Drive) lives in scripts/publish-pulse-digest.ts
 * and calls this route to fetch PNGs.
 *
 * Size variants:
 *   linkedin  1080x1080 (default) — cleanest, no disclosure footer
 *   instagram 1080x1350           — taller, includes disclosure
 *   og        1200x630            — landscape two-column for OG/Twitter
 *
 * Visual vocabulary: warm off-white surface (matches .lit-page chrome
 * across the marketing site) with brand-blue / emerald / amber stat
 * eyebrows for feature variety. Brand-cyan is reserved for the LIT
 * logomark gradient and the bottom URL anchor only — never as a
 * background or eyebrow on this light surface.
 */

type SizeKey = "linkedin" | "instagram" | "og";

type SizeSpec = {
  width: number;
  height: number;
  padding: number;
  heroFontSize: number;
  statFontSize: number;
  showDisclosure: boolean;
};

const SIZES: Record<SizeKey, SizeSpec> = {
  linkedin: { width: 1080, height: 1080, padding: 56, heroFontSize: 64, statFontSize: 44, showDisclosure: false },
  instagram: { width: 1080, height: 1350, padding: 56, heroFontSize: 56, statFontSize: 40, showDisclosure: true },
  og: { width: 1200, height: 630, padding: 48, heroFontSize: 48, statFontSize: 34, showDisclosure: false },
};

function pick(searchParams: URLSearchParams, key: string, fallback: string, max = 160): string {
  const raw = searchParams.get(key);
  if (raw == null || raw.length === 0) return fallback;
  return raw.slice(0, max);
}

// Light-surface tokens (matches marketing /about + /use-cases visual language)
const BG = "#fbfbf9";          // warm off-white canvas
const BG_BLUE_WASH = "#f4f7ff"; // top-right radial wash tint
const SURFACE_WHITE = "#ffffff";
const INK_900 = "#0F172A";     // headlines, hero
const INK_700 = "#334155";     // body text
const INK_500 = "#64748b";     // muted sub-labels
const INK_400 = "#94a3b8";     // disclosure / fine print
const INK_100 = "#e2e8f0";     // borders / dividers
const INK_50 = "#f1f5f9";      // soft fills

const BRAND_BLUE = "#3b82f6";
const BRAND_BLUE_600 = "#2563eb";
const BRAND_BLUE_700 = "#1d4ed8";
const BRAND_CYAN = "#00F0FF";  // logomark + bottom URL accent ONLY
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const PURPLE = "#8b5cf6";

// Stat eyebrow color rotation — blue / emerald / amber for visual feature variety
const STAT_ACCENTS = [BRAND_BLUE_700, EMERALD, AMBER];

function Logomark() {
  // Keeps the dark-on-cyan-gradient logo recognizable against the light surface.
  return (
    <svg width="44" height="44" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="litGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="22" fill="#020617" stroke="url(#litGrad)" strokeWidth="2.5" />
      <path d="M30 28 L30 72 L52 72" stroke="white" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M62 28 L62 72" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function BrandHeader({ week }: { week: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logomark />
        <div
          style={{
            display: "flex",
            color: INK_900,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          <span>Logistic&nbsp;</span>
          <span style={{ color: BRAND_BLUE_700, fontWeight: 800 }}>Intel</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <div
          style={{
            color: BRAND_BLUE_700,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Pulse Company Report
        </div>
        <div style={{ color: INK_500, fontSize: 13, fontFamily: "monospace" }}>{week}</div>
      </div>
    </div>
  );
}

function Hero({
  company,
  parent,
  city,
  heroFontSize,
}: {
  company: string;
  parent: string;
  city: string;
  heroFontSize: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Eyebrow chip — visual pill above hero, similar to .lit-pill */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: SURFACE_WHITE,
          border: `1px solid ${INK_100}`,
          borderRadius: 999,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 12,
          paddingRight: 14,
          color: INK_700,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.04em",
          alignSelf: "flex-start",
        }}
      >
        <div style={{ display: "flex", width: 6, height: 6, borderRadius: 3, background: BRAND_BLUE }} />
        <span>Volume shipper · this week</span>
      </div>
      <div
        style={{
          color: INK_900,
          fontSize: heroFontSize,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          lineHeight: 1.05,
        }}
      >
        {company}
      </div>
      <div style={{ display: "flex", color: INK_500, fontSize: 17, gap: 10, alignItems: "center" }}>
        {parent ? <span>{parent}</span> : null}
        {parent && city ? (
          <div style={{ display: "flex", width: 4, height: 4, borderRadius: 2, background: INK_400 }} />
        ) : null}
        {city ? <span>{city}</span> : null}
      </div>
    </div>
  );
}

function StatStrip({
  stats,
  statFontSize,
}: {
  stats: { value: string; eyebrow: string; sub: string }[];
  statFontSize: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        background: SURFACE_WHITE,
        border: `1px solid ${INK_100}`,
        borderRadius: 18,
        padding: 24,
        boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            paddingLeft: i === 0 ? 0 : 24,
            paddingRight: i === stats.length - 1 ? 0 : 24,
            borderLeft: i === 0 ? "none" : `1px solid ${INK_100}`,
            gap: 8,
          }}
        >
          <div
            style={{
              color: STAT_ACCENTS[i] ?? BRAND_BLUE_700,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {s.eyebrow}
          </div>
          <div
            style={{
              color: INK_900,
              fontSize: statFontSize,
              fontFamily: "monospace",
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {s.value}
          </div>
          <div style={{ color: INK_500, fontSize: 12 }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

function HookCard({ index, title, body }: { index: string; title: string; body: string }) {
  // Light blue-tinted hero card. Highest-contrast moment on the surface so
  // the single story hook gets the visual emphasis it deserves.
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        background: "linear-gradient(135deg, #eff6ff 0%, #f5f9ff 100%)",
        border: `1px solid rgba(59,130,246,0.18)`,
        borderRadius: 18,
        padding: 24,
        boxShadow: "0 6px 22px rgba(37, 99, 235, 0.08)",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `linear-gradient(180deg, ${BRAND_BLUE} 0%, ${BRAND_BLUE_600} 100%)`,
          color: "#ffffff",
          fontFamily: "monospace",
          fontWeight: 700,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 4px 10px rgba(37,99,235,0.35)",
        }}
      >
        {index}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ color: INK_900, fontWeight: 700, fontSize: 22, lineHeight: 1.25 }}>{title}</div>
        <div style={{ color: INK_700, fontSize: 15, lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

function HsCodes({ codes }: { codes: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          color: BRAND_BLUE_700,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        Top Cargo
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {codes.map((c, i) => {
          // Each HS code line: split first 4 chars as a colored "code chip", rest as ink-700 description
          const codeMatch = c.match(/^(\d{4})\s+(.*)$/);
          const codeLeft = codeMatch ? codeMatch[1] : c.slice(0, 4);
          const codeRight = codeMatch ? codeMatch[2] : c.slice(4).trim();
          // Rotate chip color per row for visual rhythm — blue / emerald / amber
          const chipColors = [BRAND_BLUE_700, EMERALD, AMBER];
          const chipBgs = ["rgba(59,130,246,0.10)", "rgba(16,185,129,0.10)", "rgba(245,158,11,0.10)"];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  background: chipBgs[i] ?? chipBgs[0],
                  color: chipColors[i] ?? BRAND_BLUE_700,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  fontSize: 13,
                  paddingTop: 4,
                  paddingBottom: 4,
                  paddingLeft: 10,
                  paddingRight: 10,
                  borderRadius: 6,
                  letterSpacing: "0.04em",
                  flexShrink: 0,
                }}
              >
                {codeLeft}
              </div>
              <div style={{ color: INK_700, fontSize: 14, lineHeight: 1.5 }}>{codeRight}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CarrierMix({
  carriers,
}: {
  carriers: { name: string; pct: number; pctLabel: string }[];
}) {
  const total = carriers.reduce((acc, c) => acc + (Number.isFinite(c.pct) ? c.pct : 0), 0) || 1;
  // Blue gradient family on light surface — high contrast, no cyan
  const segmentColors = [BRAND_BLUE_700, BRAND_BLUE, INK_400];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          color: BRAND_BLUE_700,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        Carrier Mix
      </div>
      <div
        style={{
          display: "flex",
          width: "100%",
          height: 14,
          borderRadius: 8,
          overflow: "hidden",
          background: INK_50,
        }}
      >
        {carriers.map((c, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              width: `${(c.pct / total) * 100}%`,
              background: segmentColors[i] ?? INK_400,
              height: "100%",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, color: INK_700, fontSize: 13 }}>
        {carriers.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                display: "flex",
                width: 9,
                height: 9,
                borderRadius: 2,
                background: segmentColors[i] ?? INK_400,
              }}
            />
            <span style={{ color: INK_700, fontWeight: 600 }}>
              {c.name} {c.pctLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footer({ showDisclosure }: { showDisclosure: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      <div style={{ display: "flex", width: "100%", height: 1, background: INK_100 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: BRAND_BLUE_700,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: BRAND_CYAN }} />
          pulse.logisticintel.com
        </div>
        {showDisclosure ? (
          <div style={{ color: INK_400, fontSize: 10 }}>
            Source: U.S. customs BOL data, last 18 mo · Sample, not census
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BackgroundWash() {
  // Subtle radial wash in top-right corner — same recipe as .lit-page chrome.
  // Keeps the surface from feeling flat without becoming busy.
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: -200,
        right: -200,
        width: 720,
        height: 720,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(59,130,246,0.10), transparent 70%)",
      }}
    />
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const sizeParam = (searchParams.get("size") || "linkedin") as SizeKey;
  const size = SIZES[sizeParam] ?? SIZES.linkedin;

  const company = pick(searchParams, "company", "Sample Volume Shipper", 80);
  const parent = pick(searchParams, "parent", "", 80);
  const city = pick(searchParams, "city", "", 60);
  const week = pick(searchParams, "week", "2026-W24", 20);

  const teu = pick(searchParams, "teu", "—", 12);
  const teuLabel = pick(searchParams, "teuLabel", "TEU sampled", 40);
  const origin = pick(searchParams, "origin", "—", 32);
  const originLabel = pick(searchParams, "originLabel", "", 40);
  const dest = pick(searchParams, "dest", "—", 32);
  const destLabel = pick(searchParams, "destLabel", "", 40);

  const hookIndex = pick(searchParams, "hookIndex", "01", 4);
  const hookTitle = pick(searchParams, "hookTitle", "Story hook", 80);
  const hookBody = pick(searchParams, "hookBody", "What this volume signals for the corridor.", 200);

  const hs1 = pick(searchParams, "hs1", "", 80);
  const hs2 = pick(searchParams, "hs2", "", 80);
  const hs3 = pick(searchParams, "hs3", "", 80);
  const hsCodes = [hs1, hs2, hs3].filter((s) => s.length > 0);

  const carrier1pct = parseFloat(pick(searchParams, "carrier1pct", "0", 8)) || 0;
  const carrier2pct = parseFloat(pick(searchParams, "carrier2pct", "0", 8)) || 0;
  const carrier3pct = parseFloat(pick(searchParams, "carrier3pct", "0", 8)) || 0;
  const carriers = [
    { name: pick(searchParams, "carrier1name", "—", 32), pct: carrier1pct, pctLabel: carrier1pct ? `${carrier1pct}%` : "" },
    { name: pick(searchParams, "carrier2name", "—", 32), pct: carrier2pct, pctLabel: carrier2pct ? `${carrier2pct}%` : "" },
    { name: pick(searchParams, "carrier3name", "—", 32), pct: carrier3pct, pctLabel: carrier3pct ? `${carrier3pct}%` : "" },
  ].filter((c) => c.name !== "—" || c.pct > 0);

  const stats = [
    { eyebrow: teuLabel, value: teu, sub: "Last 18 mo" },
    { eyebrow: originLabel || "Top origin", value: origin, sub: "Origin" },
    { eyebrow: destLabel || "Top destination", value: dest, sub: "Discharge port" },
  ];

  const isLandscape = sizeParam === "og";

  // Shared light-surface root style (warm off-white + subtle radial wash).
  const rootStyle = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    background: BG,
    backgroundImage: `radial-gradient(circle at top right, ${BG_BLUE_WASH} 0%, ${BG} 60%)`,
    padding: size.padding,
    fontFamily: "system-ui",
    position: "relative" as const,
  };

  // ---------- OG landscape: two-column split ----------
  if (isLandscape) {
    return new ImageResponse(
      (
        <div style={rootStyle}>
          <BackgroundWash />
          <BrandHeader week={week} />
          <div style={{ display: "flex", flex: 1, gap: 40, marginTop: 28 }}>
            {/* Left: hero + hook */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 20, justifyContent: "center" }}>
              <Hero company={company} parent={parent} city={city} heroFontSize={size.heroFontSize} />
              <HookCard index={hookIndex} title={hookTitle} body={hookBody} />
            </div>
            {/* Right: stats + carrier mix */}
            <div style={{ display: "flex", flexDirection: "column", width: 380, gap: 24, justifyContent: "center" }}>
              <StatStrip stats={stats} statFontSize={size.statFontSize} />
              {carriers.length > 0 ? <CarrierMix carriers={carriers} /> : null}
            </div>
          </div>
          <Footer showDisclosure={size.showDisclosure} />
        </div>
      ),
      { width: size.width, height: size.height },
    );
  }

  // ---------- Square / portrait: vertical stack ----------
  const sectionGap = sizeParam === "instagram" ? 32 : 28;

  return new ImageResponse(
    (
      <div style={{ ...rootStyle, gap: sectionGap }}>
        <BackgroundWash />

        <BrandHeader week={week} />

        <Hero company={company} parent={parent} city={city} heroFontSize={size.heroFontSize} />

        <StatStrip stats={stats} statFontSize={size.statFontSize} />

        <HookCard index={hookIndex} title={hookTitle} body={hookBody} />

        {hsCodes.length > 0 ? <HsCodes codes={hsCodes} /> : null}

        {carriers.length > 0 ? <CarrierMix carriers={carriers} /> : null}

        <div style={{ flex: 1, display: "flex" }} />

        <Footer showDisclosure={size.showDisclosure} />
      </div>
    ),
    { width: size.width, height: size.height },
  );
}
