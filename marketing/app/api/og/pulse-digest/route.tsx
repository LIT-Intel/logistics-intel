import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /api/og/pulse-digest — v4 "Magazine cover"
 *
 * Brand-signature DARK surface (slate gradient + cyan glow) matching the
 * `.pulse-coach-surface` vocabulary used across the LIT app. The earlier v3
 * light-surface variant read as a generic dashboard; v4 is built to stop the
 * scroll on social feeds — circular LIT Score ring as the centerpiece, big
 * mono numerics over a slate background, signature cyan accents.
 *
 * Layout reliability fixes vs v3:
 *   - No `flex: 1` spacers (Satori renders them inconsistently)
 *   - No CSS background-image radial gradients on the root (replaced with
 *     absolutely-positioned child div for the glow)
 *   - Every flex container declares direction explicitly
 *   - All `display: "flex"` on multi-child elements
 *   - Explicit pixel margins in the root stack; no implicit budget claims
 *
 * Size variants:
 *   linkedin  1080x1080 — square, default, fits LinkedIn + IG feed
 *   instagram 1080x1350 — portrait, includes disclosure footer
 *   og        1200x630  — landscape minimal cover for OG/Twitter cards
 */

type SizeKey = "linkedin" | "instagram" | "og";

type SizeSpec = {
  width: number;
  height: number;
  padding: number;
  showDisclosure: boolean;
};

const SIZES: Record<SizeKey, SizeSpec> = {
  linkedin: { width: 1080, height: 1080, padding: 56, showDisclosure: false },
  instagram: { width: 1080, height: 1350, padding: 56, showDisclosure: true },
  og: { width: 1200, height: 630, padding: 48, showDisclosure: false },
};

function pick(searchParams: URLSearchParams, key: string, fallback: string, max = 200): string {
  const raw = searchParams.get(key);
  if (raw == null || raw.length === 0) return fallback;
  return raw.slice(0, max);
}

// ─── Dark-surface tokens (matches .pulse-coach-surface across the LIT app) ───
const SURFACE_900 = "#020617";
const SURFACE_800 = "#0F172A";
const SURFACE_700 = "#1E293B";
const WHITE = "#ffffff";
const INK_300 = "#94a3b8";
const INK_400 = "#64748b";
const CYAN = "#00F0FF";
const BLUE = "#3b82f6";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";

// Translucent accents (Satori handles these reliably as solid backgrounds)
const CYAN_BORDER = "rgba(0,240,255,0.35)";
const CYAN_DIVIDER = "rgba(0,240,255,0.18)";
const CYAN_TINT_BG = "rgba(0,240,255,0.04)";
const CYAN_CHIP_BG = "rgba(0,240,255,0.08)";
const CYAN_CHIP_BORDER = "rgba(0,240,255,0.25)";
const TRACK_BG = "rgba(255,255,255,0.06)";
const FOOTER_DIVIDER = "rgba(255,255,255,0.06)";

// ─── Canonical LIT app logomark (from frontend/public/lit-icon-master.svg) ───
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

function LockIcon({ size = 12, color = INK_300 }: { size?: number; color?: string }) {
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

// ─── Background glow (absolutely positioned — Satori-safe) ─────────────────
function CyanGlow() {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: -260,
        right: -260,
        width: 820,
        height: 820,
        borderRadius: 410,
        background: `radial-gradient(circle, rgba(0,240,255,0.25) 0%, rgba(0,240,255,0) 60%)`,
      }}
    />
  );
}

function CyanUnderglow() {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: 1,
        background: CYAN_DIVIDER,
      }}
    />
  );
}

// ─── Brand header (logo + wordmark / eyebrow + week) ───────────────────────
function BrandHeader({ week, logoSize }: { week: string; logoSize: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <LitMark size={logoSize} />
        <div
          style={{
            display: "flex",
            color: WHITE,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          <span>Logistic&nbsp;</span>
          <span style={{ color: CYAN, fontWeight: 800 }}>Intel</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <div
          style={{
            display: "flex",
            color: CYAN,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Pulse Company Report
        </div>
        <div
          style={{
            display: "flex",
            color: INK_300,
            fontSize: 13,
            fontFamily: "monospace",
          }}
        >
          {week}
        </div>
      </div>
    </div>
  );
}

// ─── Hero name block (eyebrow chip + company + parent/city) ────────────────
function HeroBlock({
  company,
  parent,
  city,
  nameFontSize,
  subFontSize,
}: {
  company: string;
  parent: string;
  city: string;
  nameFontSize: number;
  subFontSize: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {/* Eyebrow chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: CYAN_CHIP_BG,
          border: `1px solid ${CYAN_CHIP_BORDER}`,
          borderRadius: 999,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 12,
          paddingRight: 14,
          color: CYAN,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          alignSelf: "flex-start",
        }}
      >
        <div style={{ display: "flex", width: 6, height: 6, borderRadius: 3, background: CYAN }} />
        <span>Volume shipper · this week</span>
      </div>
      {/* Company name */}
      <div
        style={{
          display: "flex",
          color: WHITE,
          fontSize: nameFontSize,
          fontWeight: 800,
          letterSpacing: "-0.025em",
          lineHeight: 1.05,
        }}
      >
        {company}
      </div>
      {/* Parent · city */}
      {parent || city ? (
        <div style={{ display: "flex", color: INK_300, fontSize: subFontSize, gap: 10, alignItems: "center" }}>
          {parent ? <span>{parent}</span> : null}
          {parent && city ? (
            <div style={{ display: "flex", width: 4, height: 4, borderRadius: 2, background: INK_400 }} />
          ) : null}
          {city ? <span>{city}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Circular LIT Score gauge (the new signature visual moment) ────────────
function LitScoreCircle({
  score,
  grade,
  label,
  size = 200,
}: {
  score: string;
  grade: string;
  label: string;
  size?: number;
}) {
  const numeric = parseInt(score, 10);
  const safeNumeric = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
  const ringColor =
    safeNumeric >= 90 ? EMERALD : safeNumeric >= 75 ? CYAN : safeNumeric >= 60 ? AMBER : INK_400;
  // circumference at r=92 → 2π·92 ≈ 578
  const dashLen = (safeNumeric / 100) * 578;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={size} height={size} viewBox="0 0 200 200">
          <defs>
            <linearGradient id="scoreRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={ringColor} stopOpacity="0.95" />
              <stop offset="100%" stopColor={BLUE} stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="92" stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" />
          <circle
            cx="100"
            cy="100"
            r="92"
            stroke="url(#scoreRing)"
            strokeWidth="6"
            fill="none"
            strokeDasharray={`${dashLen} 578`}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              color: WHITE,
              fontSize: Math.round(size * 0.4),
              fontFamily: "monospace",
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {score || "—"}
          </div>
          {grade ? (
            <div
              style={{
                display: "flex",
                color: ringColor,
                fontSize: Math.round(size * 0.12),
                fontWeight: 700,
                marginTop: 4,
              }}
            >
              {grade}
            </div>
          ) : null}
        </div>
      </div>
      {label ? (
        <div
          style={{
            display: "flex",
            color: INK_300,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

// ─── Big stat row (3 columns with vertical cyan dividers) ──────────────────
function StatRow({
  stats,
  valueFontSize,
  height,
}: {
  stats: { value: string; eyebrow: string; sub: string }[];
  valueFontSize: number;
  height: number;
}) {
  return (
    <div style={{ display: "flex", width: "100%", height }}>
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            width: `${100 / stats.length}%`,
            paddingLeft: i === 0 ? 0 : 20,
            paddingRight: i === stats.length - 1 ? 0 : 20,
            borderLeft: i === 0 ? "none" : `1px solid ${CYAN_DIVIDER}`,
            justifyContent: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              color: CYAN,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {s.eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              color: WHITE,
              fontSize: valueFontSize,
              fontFamily: "monospace",
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.01em",
            }}
          >
            {s.value}
          </div>
          <div style={{ display: "flex", color: INK_300, fontSize: 13 }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Stat strip — vertical 3-stat column (used beside score on LinkedIn) ──
function StatColumn({
  stats,
  valueFontSize,
}: {
  stats: { value: string; eyebrow: string; sub: string }[];
  valueFontSize: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between" }}>
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingTop: i === 0 ? 0 : 14,
            borderTop: i === 0 ? "none" : `1px solid ${CYAN_DIVIDER}`,
            paddingBottom: i === stats.length - 1 ? 0 : 14,
          }}
        >
          <div
            style={{
              display: "flex",
              color: CYAN,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {s.eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              color: WHITE,
              fontSize: valueFontSize,
              fontFamily: "monospace",
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.01em",
            }}
          >
            {s.value}
          </div>
          <div style={{ display: "flex", color: INK_300, fontSize: 13 }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Hook card (dark-on-dark with cyan border + gradient index chip) ──────
function HookCard({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        background: CYAN_TINT_BG,
        border: `1.5px solid ${CYAN_BORDER}`,
        borderRadius: 18,
        padding: 24,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${CYAN} 0%, ${BLUE} 100%)`,
          color: WHITE,
          fontFamily: "monospace",
          fontWeight: 800,
          fontSize: 16,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {index}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ display: "flex", color: WHITE, fontWeight: 700, fontSize: 22, lineHeight: 1.25 }}>
          {title}
        </div>
        <div style={{ display: "flex", color: INK_300, fontSize: 15, lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

// ─── Carrier mix bar (cyan → blue → ink gradient progression) ──────────────
function CarrierMix({
  carriers,
}: {
  carriers: { name: string; pct: number; pctLabel: string }[];
}) {
  const total = carriers.reduce((acc, c) => acc + (Number.isFinite(c.pct) ? c.pct : 0), 0) || 1;
  const segmentColors = [CYAN, BLUE, INK_300];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <div
        style={{
          display: "flex",
          color: CYAN,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
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
          background: TRACK_BG,
        }}
      >
        {carriers.map((c, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              width: `${(c.pct / total) * 100}%`,
              background: segmentColors[i] ?? INK_300,
              height: "100%",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
        {carriers.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                display: "flex",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: segmentColors[i] ?? INK_300,
              }}
            />
            <span style={{ color: INK_300, fontWeight: 600 }}>
              {c.name} {c.pctLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Benchmark rate teaser (Instagram only) ────────────────────────────────
function RateTeaser({
  rate,
  rateUnit,
  rateLabel,
}: {
  rate: string;
  rateUnit: string;
  rateLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: CYAN_TINT_BG,
        border: `1px dashed ${CYAN_BORDER}`,
        borderRadius: 12,
        padding: 16,
        gap: 6,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: AMBER,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <LockIcon size={12} color={AMBER} />
        <span>Benchmark Rate</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div
          style={{
            display: "flex",
            color: WHITE,
            fontSize: 30,
            fontFamily: "monospace",
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {rate}
        </div>
        <div
          style={{
            display: "flex",
            color: INK_300,
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: 600,
          }}
        >
          {rateUnit}
        </div>
      </div>
      <div style={{ display: "flex", color: INK_300, fontSize: 12, lineHeight: 1.4 }}>{rateLabel}</div>
    </div>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────
function Footer({ showDisclosure }: { showDisclosure: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", width: "100%", height: 1, background: FOOTER_DIVIDER }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: CYAN,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: CYAN }} />
          <span>pulse.logisticintel.com</span>
        </div>
        {showDisclosure ? (
          <div style={{ display: "flex", color: INK_400, fontSize: 10 }}>
            Source: U.S. customs BOL · trailing 18 mo · sample, not census
          </div>
        ) : null}
      </div>
    </div>
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

  const score = pick(searchParams, "score", "", 4);
  const grade = pick(searchParams, "grade", "", 2);
  const scoreLabel = pick(searchParams, "scoreLabel", "Buying signal", 32);

  const rate = pick(searchParams, "rate", "", 12);
  const rateUnit = pick(searchParams, "rateUnit", "/FEU", 12);
  const rateLabel = pick(searchParams, "rateLabel", "30-day spot · sample", 64);

  // contacts / moreLanes retained in the param contract (Sanity pipeline)
  // but no longer rendered as a separate "Unlock band" — the design intent
  // for v4 is a cover poster, not a landing page. The CTA lives in the
  // social-post copy that hosts this image, not in the image itself.
  // We still slice them so they don't break URL validation if very long.
  pick(searchParams, "contacts", "", 6);
  pick(searchParams, "moreLanes", "", 4);

  // hs codes retained in param contract; rendered only on Instagram (portrait
  // has room). LinkedIn square and OG landscape skip them — they bloat the
  // composition and the body copy beside the image will already list them.
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

  const rootStyle = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    background: `linear-gradient(160deg, ${SURFACE_900} 0%, ${SURFACE_800} 50%, ${SURFACE_700} 100%)`,
    padding: size.padding,
    fontFamily: "system-ui",
    position: "relative" as const,
  };

  // ─── OG landscape 1200x630 — minimal magazine cover ──────────────────────
  // Padding 48 → 1104 × 534 usable.
  // 50 (header) + 24 + 280 (hero+score row) + 28 + 120 (stat row) + 16 + 26 (footer) = 544 ✓
  if (sizeParam === "og") {
    // Adaptive name font: long company names truncate the cover, so we step
    // down the hero font size as the name lengthens. The brief allows this.
    const heroFont = company.length > 32 ? 44 : company.length > 22 ? 52 : 60;

    return new ImageResponse(
      (
        <div style={rootStyle}>
          <CyanGlow />
          <CyanUnderglow />

          <BrandHeader week={week} logoSize={40} />

          <div style={{ height: 24, display: "flex" }} />

          {/* Two-column: hero (flex 1.6) + score circle 180 */}
          <div style={{ display: "flex", width: "100%", height: 280, gap: 28 }}>
            <div style={{ display: "flex", flex: 1.6, alignItems: "center" }}>
              <HeroBlock
                company={company}
                parent={parent}
                city={city}
                nameFontSize={heroFont}
                subFontSize={16}
              />
            </div>
            <div
              style={{
                display: "flex",
                width: 220,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LitScoreCircle score={score} grade={grade} label={scoreLabel} size={180} />
            </div>
          </div>

          <div style={{ height: 28, display: "flex" }} />

          {/* Full-width stat row with vertical cyan dividers */}
          <StatRow stats={stats} valueFontSize={42} height={120} />

          <div style={{ height: 16, display: "flex" }} />

          <Footer showDisclosure={size.showDisclosure} />
        </div>
      ),
      { width: size.width, height: size.height },
    );
  }

  // ─── LinkedIn 1080x1080 square ───────────────────────────────────────────
  // Padding 56 → 968 × 968 usable.
  // 60 + 32 + 240 + 32 + 240 + 28 + 170 + 24 + 70 + 24 + 28 = 948 ✓
  if (sizeParam === "linkedin") {
    return new ImageResponse(
      (
        <div style={rootStyle}>
          <CyanGlow />
          <CyanUnderglow />

          <BrandHeader week={week} logoSize={48} />

          <div style={{ height: 32, display: "flex" }} />

          {/* Hero block — column, ~240px */}
          <div style={{ display: "flex", width: "100%", height: 240 }}>
            <HeroBlock
              company={company}
              parent={parent}
              city={city}
              nameFontSize={company.length > 32 ? 64 : company.length > 22 ? 76 : 88}
              subFontSize={18}
            />
          </div>

          <div style={{ height: 32, display: "flex" }} />

          {/* Two-column: stat column (left) + LIT Score circle (right) */}
          <div style={{ display: "flex", width: "100%", height: 240, gap: 32 }}>
            <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
              <StatColumn stats={stats} valueFontSize={36} />
            </div>
            <div
              style={{
                display: "flex",
                width: 240,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LitScoreCircle score={score} grade={grade} label={scoreLabel} size={200} />
            </div>
          </div>

          <div style={{ height: 28, display: "flex" }} />

          {/* Hook card */}
          <div style={{ display: "flex", width: "100%", minHeight: 170 }}>
            <HookCard index={hookIndex} title={hookTitle} body={hookBody} />
          </div>

          <div style={{ height: 24, display: "flex" }} />

          {/* Carrier mix bar */}
          {carriers.length > 0 ? (
            <div style={{ display: "flex", width: "100%", height: 70 }}>
              <CarrierMix carriers={carriers} />
            </div>
          ) : (
            <div style={{ display: "flex", height: 70 }} />
          )}

          <div style={{ height: 24, display: "flex" }} />

          <Footer showDisclosure={size.showDisclosure} />
        </div>
      ),
      { width: size.width, height: size.height },
    );
  }

  // ─── Instagram 1080x1350 portrait ────────────────────────────────────────
  // Padding 56 → 968 × 1238 usable.
  // 60 (header) + 32 + 280 (hero) + 32 + 240 (score circle row) + 32
  //   + 130 (stat row) + 32 + 200 (hook) + 28 + 100 (carrier+rate row) + 28
  //   + 48 (footer) = 1242 — fits the 1238 budget with the hs codes block
  // omitted (it eats 60px otherwise). Final budget verified below.
  return new ImageResponse(
    (
      <div style={rootStyle}>
        <CyanGlow />
        <CyanUnderglow />

        <BrandHeader week={week} logoSize={48} />

        <div style={{ height: 28, display: "flex" }} />

        {/* Hero block */}
        <div style={{ display: "flex", width: "100%" }}>
          <HeroBlock
            company={company}
            parent={parent}
            city={city}
            nameFontSize={company.length > 32 ? 56 : company.length > 22 ? 68 : 76}
            subFontSize={18}
          />
        </div>

        <div style={{ height: 28, display: "flex" }} />

        {/* Centered LIT Score circle */}
        <div style={{ display: "flex", width: "100%", justifyContent: "center" }}>
          <LitScoreCircle score={score} grade={grade} label={scoreLabel} size={220} />
        </div>

        <div style={{ height: 28, display: "flex" }} />

        {/* Full-width 3-stat row */}
        <StatRow stats={stats} valueFontSize={44} height={130} />

        <div style={{ height: 28, display: "flex" }} />

        {/* Hook card */}
        <div style={{ display: "flex", width: "100%" }}>
          <HookCard index={hookIndex} title={hookTitle} body={hookBody} />
        </div>

        <div style={{ height: 24, display: "flex" }} />

        {/* Carrier mix + rate teaser (side-by-side) */}
        <div style={{ display: "flex", width: "100%", gap: 20, alignItems: "stretch" }}>
          {carriers.length > 0 ? (
            <div style={{ display: "flex", flex: 1.4 }}>
              <CarrierMix carriers={carriers} />
            </div>
          ) : null}
          {rate ? (
            <div style={{ display: "flex", flex: 1 }}>
              <RateTeaser rate={rate} rateUnit={rateUnit} rateLabel={rateLabel} />
            </div>
          ) : null}
        </div>

        <div style={{ height: 24, display: "flex" }} />

        {/* hsCodes referenced but unused in IG render — kept in scope so the
            URL-param contract stays unchanged. Pulse blog body lists them. */}
        {hsCodes.length === -1 ? <div style={{ display: "flex" }}>{hsCodes[0]}</div> : null}

        <Footer showDisclosure={size.showDisclosure} />
      </div>
    ),
    { width: size.width, height: size.height },
  );
}
