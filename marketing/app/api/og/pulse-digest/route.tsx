import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const CARD_ALT = "LIT Pulse Company Report — weekly supply-chain digest card";

/**
 * /api/og/pulse-digest
 *
 * Weekly Pulse Company Report card for a single high-volume U.S. importer.
 * Light surface (warm off-white + radial blue wash), real LIT mark, premium
 * card chrome, opportunity score as the signature visual, benchmark-rate
 * + verified-contacts tease elements to drive clickthrough to LIT.
 *
 * All copy + numbers come in via URL params (edge runtime, no DB).
 *
 * Size variants:
 *   linkedin  1080x1080 — square, default, fits LinkedIn + IG feed
 *   instagram 1080x1350 — portrait, includes disclosure footer
 *   og        1200x630  — landscape two-column for OG/Twitter cards
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
  linkedin: { width: 1080, height: 1080, padding: 56, heroFontSize: 56, statFontSize: 38, showDisclosure: false },
  instagram: { width: 1080, height: 1350, padding: 56, heroFontSize: 56, statFontSize: 40, showDisclosure: true },
  og: { width: 1200, height: 630, padding: 48, heroFontSize: 44, statFontSize: 30, showDisclosure: false },
};

function pick(searchParams: URLSearchParams, key: string, fallback: string, max = 200): string {
  const raw = searchParams.get(key);
  if (raw == null || raw.length === 0) return fallback;
  return raw.slice(0, max);
}

// ─── Light-surface tokens (matches .lit-page chrome across marketing) ───
const BG = "#fbfbf9";
const BG_WASH = "#eef4ff";
const SURFACE_WHITE = "#ffffff";
const SURFACE_BLUE_TINT = "#eff6ff";
const INK_900 = "#0f172a";
const INK_700 = "#334155";
const INK_500 = "#64748b";
const INK_400 = "#94a3b8";
const INK_200 = "#cbd5e1";
const INK_100 = "#e2e8f0";
const INK_50 = "#f1f5f9";

const BRAND_BLUE = "#3b82f6";
const BRAND_BLUE_600 = "#2563eb";
const BRAND_BLUE_700 = "#1d4ed8";
const BRAND_CYAN = "#00F0FF";
const EMERALD = "#10b981";
const EMERALD_50 = "#ecfdf5";
const AMBER = "#f59e0b";
const AMBER_50 = "#fffbeb";

const STAT_ACCENTS = [BRAND_BLUE_700, EMERALD, AMBER];

// ─── Canonical LIT app logomark (from frontend/public/lit-icon-master.svg) ───
// Dark slate rounded square + cyan "LI" letterforms with neon-glow drop shadow.
// next/og supports <filter> and <feDropShadow> via Satori, so the glow renders
// as designed instead of being flattened to a static stroke.
function LitMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="litNeonGlow" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor="#00F0FF" floodOpacity="0.55" />
          <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#00F0FF" floodOpacity="0.28" />
        </filter>
      </defs>
      <rect width="64" height="64" rx="16" fill="#020617" />
      <g filter="url(#litNeonGlow)">
        <path d="M14 14v36h20" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M30 14h22" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M30 28h9" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M44 28v22" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M30 50h14" stroke="#00F0FF" strokeWidth="6" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

function LockIcon({ size = 12, color = INK_500 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 11V8a5 5 0 0110 0v3M5 11h14v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function ArrowIcon({ size = 14, color = BRAND_BLUE_700 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ─── Brand header ────────────────────────────────────────────────────────
function BrandHeader({ week }: { week: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <LitMark size={48} />
        <div
          style={{
            display: "flex",
            color: INK_900,
            fontSize: 24,
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

// ─── Hero block + opportunity score (right-anchored) ─────────────────────
function HeroAndScore({
  company,
  parent,
  city,
  heroFontSize,
  score,
  grade,
  scoreLabel,
}: {
  company: string;
  parent: string;
  city: string;
  heroFontSize: number;
  score: string;
  grade: string;
  scoreLabel: string;
}) {
  // Score tier → tinted color
  const numeric = parseInt(score, 10);
  const tier =
    Number.isFinite(numeric) && numeric >= 90
      ? { color: EMERALD, bg: EMERALD_50, gradeBg: EMERALD }
      : Number.isFinite(numeric) && numeric >= 75
        ? { color: BRAND_BLUE_700, bg: SURFACE_BLUE_TINT, gradeBg: BRAND_BLUE_700 }
        : Number.isFinite(numeric) && numeric >= 60
          ? { color: AMBER, bg: AMBER_50, gradeBg: AMBER }
          : { color: INK_500, bg: INK_50, gradeBg: INK_500 };

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
      {/* Left: company identity */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 14, justifyContent: "center" }}>
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
            lineHeight: 1.04,
          }}
        >
          {company}
        </div>
        <div style={{ display: "flex", color: INK_500, fontSize: 16, gap: 10, alignItems: "center" }}>
          {parent ? <span>{parent}</span> : null}
          {parent && city ? (
            <div style={{ display: "flex", width: 4, height: 4, borderRadius: 2, background: INK_400 }} />
          ) : null}
          {city ? <span>{city}</span> : null}
        </div>
      </div>

      {/* Right: LIT Score gauge */}
      {score ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 220,
            background: tier.bg,
            border: `1.5px solid ${tier.color}`,
            borderRadius: 18,
            paddingTop: 18,
            paddingBottom: 18,
            paddingLeft: 18,
            paddingRight: 18,
            gap: 6,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
          }}
        >
          <div
            style={{
              color: tier.color,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            LIT Score
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                color: tier.color,
                fontSize: 64,
                fontFamily: "monospace",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {score}
            </div>
            {grade ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 7,
                  background: tier.gradeBg,
                  color: SURFACE_WHITE,
                  fontSize: 16,
                  fontWeight: 800,
                  fontFamily: "monospace",
                }}
              >
                {grade}
              </div>
            ) : null}
          </div>
          {scoreLabel ? (
            <div style={{ color: INK_700, fontSize: 12, textAlign: "center", fontWeight: 600, marginTop: 2 }}>
              {scoreLabel}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Premium 3-stat strip (white card, multi-color eyebrows) ─────────────
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
        padding: 22,
        boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            paddingLeft: i === 0 ? 0 : 22,
            paddingRight: i === stats.length - 1 ? 0 : 22,
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
              lineHeight: 1.02,
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

// ─── Story hook card (signature blue gradient surface) ───────────────────
function HookCard({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)",
        border: `1.5px solid ${BRAND_BLUE}`,
        borderRadius: 18,
        padding: 22,
        boxShadow: "0 8px 24px rgba(37,99,235,0.10)",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `linear-gradient(180deg, ${BRAND_BLUE} 0%, ${BRAND_BLUE_700} 100%)`,
          color: SURFACE_WHITE,
          fontFamily: "monospace",
          fontWeight: 800,
          fontSize: 15,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 4px 12px rgba(37,99,235,0.40)",
        }}
      >
        {index}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ color: INK_900, fontWeight: 700, fontSize: 20, lineHeight: 1.25 }}>{title}</div>
        <div style={{ color: INK_700, fontSize: 14, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}

// ─── Top cargo (HS code chips, multi-color rotation) ─────────────────────
function HsCodes({ codes }: { codes: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {codes.map((c, i) => {
          const m = c.match(/^(\d{4})\s+(.*)$/);
          const code = m ? m[1] : c.slice(0, 4);
          const desc = m ? m[2] : c.slice(4).trim();
          const colors = [BRAND_BLUE_700, EMERALD, AMBER];
          const bgs = ["rgba(59,130,246,0.10)", "rgba(16,185,129,0.10)", "rgba(245,158,11,0.10)"];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  background: bgs[i] ?? bgs[0],
                  color: colors[i] ?? BRAND_BLUE_700,
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
                {code}
              </div>
              <div style={{ color: INK_700, fontSize: 13, lineHeight: 1.4 }}>{desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Carrier mix bar + benchmark rate teaser (side-by-side row) ──────────
function CarrierAndRate({
  carriers,
  rate,
  rateUnit,
  rateLabel,
}: {
  carriers: { name: string; pct: number; pctLabel: string }[];
  rate: string;
  rateUnit: string;
  rateLabel: string;
}) {
  const total = carriers.reduce((acc, c) => acc + (Number.isFinite(c.pct) ? c.pct : 0), 0) || 1;
  const segmentColors = [BRAND_BLUE_700, BRAND_BLUE, INK_400];
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
      {/* Carrier mix — left, ~60% width */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1.4, gap: 8 }}>
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
        <div style={{ display: "flex", gap: 14, color: INK_700, fontSize: 12 }}>
          {carriers.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  display: "flex",
                  width: 8,
                  height: 8,
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

      {/* Benchmark rate teaser — right, ~40% width, locked feel */}
      {rate ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: SURFACE_WHITE,
            border: `1px dashed ${INK_200}`,
            borderRadius: 12,
            padding: 12,
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: AMBER,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <LockIcon size={10} color={AMBER} />
            <span>Benchmark Rate</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <div style={{ color: INK_900, fontSize: 24, fontFamily: "monospace", fontWeight: 700, lineHeight: 1 }}>
              {rate}
            </div>
            <div style={{ color: INK_500, fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>{rateUnit}</div>
          </div>
          <div style={{ color: INK_500, fontSize: 11, lineHeight: 1.4 }}>{rateLabel}</div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Unlock CTA band (drives clickthrough) ───────────────────────────────
function UnlockBand({ contacts, moreLanes }: { contacts: string; moreLanes: string }) {
  // Tease elements: verified contacts, additional lanes, full benchmark.
  // Bottom band reads like a "preview pane" cue — visible but locked.
  const teases: string[] = [];
  if (contacts) teases.push(`${contacts} verified contacts`);
  if (moreLanes) teases.push(`+${moreLanes} lanes`);
  teases.push("full benchmark rates");
  const teaseLine = teases.join(" · ");
  return (
    <div
      style={{
        display: "flex",
        background: `linear-gradient(135deg, ${BRAND_BLUE_700} 0%, ${BRAND_BLUE_600} 100%)`,
        borderRadius: 14,
        padding: 16,
        gap: 14,
        alignItems: "center",
        boxShadow: "0 10px 24px rgba(29,78,216,0.30)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 9,
          background: "rgba(255,255,255,0.20)",
          flexShrink: 0,
        }}
      >
        <LockIcon size={16} color="#ffffff" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        <div
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Unlock the full report
        </div>
        <div style={{ color: SURFACE_WHITE, fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{teaseLine}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: SURFACE_WHITE,
          fontSize: 13,
          fontWeight: 700,
          background: "rgba(255,255,255,0.18)",
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 14,
          paddingRight: 14,
          borderRadius: 8,
        }}
      >
        <span>logisticintel.com</span>
        <ArrowIcon size={14} color="#ffffff" />
      </div>
    </div>
  );
}

function Footer({ showDisclosure }: { showDisclosure: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", width: "100%", height: 1, background: INK_100 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: BRAND_BLUE_700,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: BRAND_CYAN }} />
          pulse.logisticintel.com
        </div>
        {showDisclosure ? (
          <div style={{ color: INK_400, fontSize: 10 }}>
            U.S. customs BOL sample · trailing 18 mo · directional, not census
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BackgroundWash() {
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
        background: `radial-gradient(circle, ${BG_WASH}, transparent 70%)`,
      }}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
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
  const originLabel = pick(searchParams, "originLabel", "Top origin", 40);
  const dest = pick(searchParams, "dest", "—", 32);
  const destLabel = pick(searchParams, "destLabel", "Discharge port", 40);

  const hookIndex = pick(searchParams, "hookIndex", "01", 4);
  const hookTitle = pick(searchParams, "hookTitle", "Story hook", 80);
  const hookBody = pick(searchParams, "hookBody", "What this volume signals.", 200);

  // ── NEW: LIT opportunity score ──
  const score = pick(searchParams, "score", "", 4);
  const grade = pick(searchParams, "grade", "", 2);
  const scoreLabel = pick(searchParams, "scoreLabel", "Buying signal", 32);

  // ── NEW: benchmark rate teaser ──
  const rate = pick(searchParams, "rate", "", 12);
  const rateUnit = pick(searchParams, "rateUnit", "/FEU", 12);
  const rateLabel = pick(searchParams, "rateLabel", "30-day spot · sample", 64);

  // ── NEW: unlock band teases ──
  const contacts = pick(searchParams, "contacts", "", 6);
  const moreLanes = pick(searchParams, "moreLanes", "", 4);

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
    { eyebrow: originLabel, value: origin, sub: "Origin" },
    { eyebrow: destLabel, value: dest, sub: "Discharge port" },
  ];

  const isLandscape = sizeParam === "og";

  const rootStyle = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    background: BG,
    backgroundImage: `radial-gradient(circle at top right, ${BG_WASH} 0%, ${BG} 60%)`,
    padding: size.padding,
    fontFamily: "system-ui",
    position: "relative" as const,
  };

  // ─── OG landscape: tight two-column ──────────────────────────────────
  if (isLandscape) {
    return new ImageResponse(
      (
        <div style={rootStyle}>
          <BackgroundWash />
          <BrandHeader week={week} />
          <div style={{ display: "flex", flex: 1, gap: 32, marginTop: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 16, justifyContent: "center" }}>
              <HeroAndScore
                company={company}
                parent={parent}
                city={city}
                heroFontSize={size.heroFontSize}
                score={score}
                grade={grade}
                scoreLabel={scoreLabel}
              />
              <HookCard index={hookIndex} title={hookTitle} body={hookBody} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", width: 360, gap: 16, justifyContent: "center" }}>
              <StatStrip stats={stats} statFontSize={size.statFontSize} />
              {carriers.length > 0 ? (
                <CarrierAndRate carriers={carriers} rate={rate} rateUnit={rateUnit} rateLabel={rateLabel} />
              ) : null}
            </div>
          </div>
          <Footer showDisclosure={size.showDisclosure} />
        </div>
      ),
      { width: size.width, height: size.height },
    );
  }

  // ─── Square / portrait: vertical stack ──────────────────────────────
  const sectionGap = sizeParam === "instagram" ? 26 : 22;

  return new ImageResponse(
    (
      <div style={{ ...rootStyle, gap: sectionGap }}>
        <BackgroundWash />

        <BrandHeader week={week} />

        <HeroAndScore
          company={company}
          parent={parent}
          city={city}
          heroFontSize={size.heroFontSize}
          score={score}
          grade={grade}
          scoreLabel={scoreLabel}
        />

        <StatStrip stats={stats} statFontSize={size.statFontSize} />

        <HookCard index={hookIndex} title={hookTitle} body={hookBody} />

        {hsCodes.length > 0 ? <HsCodes codes={hsCodes} /> : null}

        {carriers.length > 0 ? (
          <CarrierAndRate carriers={carriers} rate={rate} rateUnit={rateUnit} rateLabel={rateLabel} />
        ) : null}

        <div style={{ flex: 1, display: "flex" }} />

        {(contacts || moreLanes) ? <UnlockBand contacts={contacts} moreLanes={moreLanes} /> : null}

        <Footer showDisclosure={size.showDisclosure} />
      </div>
    ),
    { width: size.width, height: size.height },
  );
}
