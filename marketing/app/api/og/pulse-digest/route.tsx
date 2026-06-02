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
 * Visual vocabulary extends .pulse-coach-surface (globals.css):
 *   slate gradient + cyan radial top-right + cyan underglow inset.
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

const CYAN = "#00F0FF";
const INK_300 = "#94a3b8";
const INK_400 = "#64748b";
const WHITE = "#f8fafc";
const HOOK_BORDER = "rgba(0,240,255,0.2)";
const HOOK_BG = "rgba(0,240,255,0.08)";
const DIVIDER = "rgba(255,255,255,0.1)";

function Logomark() {
  return (
    <svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Logomark />
        <div
          style={{
            color: WHITE,
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "0.04em",
          }}
        >
          LOGISTIC INTEL
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <div
          style={{
            color: CYAN,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Pulse Company Report
        </div>
        <div style={{ color: INK_300, fontSize: 13, fontFamily: "monospace" }}>{week}</div>
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
      <div
        style={{
          color: WHITE,
          fontSize: heroFontSize,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          lineHeight: 1.05,
        }}
      >
        {company}
      </div>
      <div style={{ display: "flex", color: INK_300, fontSize: 16, gap: 10, alignItems: "center" }}>
        {parent ? <span>{parent}</span> : null}
        {parent && city ? (
          <div style={{ width: 4, height: 4, borderRadius: 2, background: INK_400, display: "flex" }} />
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
    <div style={{ display: "flex", width: "100%" }}>
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            paddingLeft: i === 0 ? 0 : 24,
            paddingRight: i === stats.length - 1 ? 0 : 24,
            borderLeft: i === 0 ? "none" : `1px solid ${DIVIDER}`,
            gap: 8,
          }}
        >
          <div
            style={{
              color: CYAN,
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
              color: WHITE,
              fontSize: statFontSize,
              fontFamily: "monospace",
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {s.value}
          </div>
          <div style={{ color: INK_400, fontSize: 12 }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

function HookCard({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        background: HOOK_BG,
        border: `1px solid ${HOOK_BORDER}`,
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: "rgba(0,240,255,0.15)",
          color: WHITE,
          fontFamily: "monospace",
          fontWeight: 700,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {index}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ color: WHITE, fontWeight: 600, fontSize: 22, lineHeight: 1.2 }}>{title}</div>
        <div style={{ color: INK_300, fontSize: 15, lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

function HsCodes({ codes }: { codes: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          color: CYAN,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        Top Cargo
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {codes.map((c, i) => (
          <div
            key={i}
            style={{
              color: WHITE,
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {c}
          </div>
        ))}
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
  // Cyan gradient stops — most concentrated → ink
  const segmentColors = ["#00F0FF", "#22d3ee", "#475569"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          color: CYAN,
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
          height: 12,
          borderRadius: 6,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
        }}
      >
        {carriers.map((c, i) => (
          <div
            key={i}
            style={{
              width: `${(c.pct / total) * 100}%`,
              background: segmentColors[i] ?? "#334155",
              height: "100%",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, color: WHITE, fontSize: 12 }}>
        {carriers.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: segmentColors[i] ?? "#334155",
              }}
            />
            <span style={{ color: WHITE }}>
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
      <div style={{ width: "100%", height: 1, background: DIVIDER }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <div style={{ color: CYAN, fontSize: 12, fontWeight: 600 }}>pulse.logisticintel.com</div>
        {showDisclosure ? (
          <div style={{ color: INK_400, fontSize: 10 }}>
            Source: U.S. customs BOL data, last 18 mo · Sample, not census
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CyanRadialGlow() {
  return (
    <div
      style={{
        position: "absolute",
        top: -180,
        right: -180,
        width: 560,
        height: 560,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)",
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

  // ---------- OG landscape: two-column split ----------
  if (isLandscape) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)",
            padding: size.padding,
            fontFamily: "system-ui",
            position: "relative",
            boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
          }}
        >
          <CyanRadialGlow />
          <BrandHeader week={week} />
          <div style={{ display: "flex", flex: 1, gap: 40, marginTop: 28 }}>
            {/* Left: hero */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 20, justifyContent: "center" }}>
              <Hero company={company} parent={parent} city={city} heroFontSize={size.heroFontSize} />
              <HookCard index={hookIndex} title={hookTitle} body={hookBody} />
            </div>
            {/* Right: stats */}
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
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)",
          padding: size.padding,
          fontFamily: "system-ui",
          position: "relative",
          boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
          gap: sectionGap,
        }}
      >
        <CyanRadialGlow />

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
