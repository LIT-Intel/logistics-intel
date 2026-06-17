/**
 * Executive Pre-Call Brief PDF — premium-grade companion to the existing
 * exportPulseBriefPdf.ts.
 *
 * Where the original brief reads like a sales-rep prep doc, this one is
 * built for execs scanning before a 30-minute discovery call. Every page
 * earns its place: cover with grade, at-a-glance infographic page,
 * pre-call talking points, objections + responses, best-contact, trade
 * lane breakdown, sources.
 *
 * Brand: LIT navy + electric cyan + the pulse mark drawn natively (same
 * system as the Explorer PDF in pulseReportPdf.js).
 *
 * Falls back gracefully when `executive_overview` is missing (older
 * cached briefs from before the schema extension): renders a "Refresh
 * this brief to generate the executive view" placeholder page and uses
 * the legacy report fields where possible.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── LIT brand palette (mirrors Pulse Explorer PDF) ───────────────────────
const LIT_NAVY: [number, number, number] = [2, 6, 23];        // #020617
const LIT_NAVY_SOFT: [number, number, number] = [15, 24, 40]; // #0F1828
const LIT_CYAN_NEON: [number, number, number] = [0, 224, 255];// #00E0FF
const LIT_CYAN_600: [number, number, number] = [8, 145, 178]; // #0891B2
const LIT_CYAN_50: [number, number, number] = [236, 254, 255];// #ECFEFF
const LIT_SLATE_900: [number, number, number] = [15, 23, 42];
const LIT_SLATE_700: [number, number, number] = [51, 65, 85];
const LIT_SLATE_600: [number, number, number] = [71, 85, 105];
const LIT_SLATE_400: [number, number, number] = [148, 163, 184];
const LIT_SLATE_200: [number, number, number] = [226, 232, 240];
const LIT_EMERALD_600: [number, number, number] = [5, 150, 105];
const LIT_AMBER_500: [number, number, number] = [245, 158, 11];
const LIT_RED_600: [number, number, number] = [220, 38, 38];

const GRADE_COLOR: Record<string, [number, number, number]> = {
  A: LIT_EMERALD_600,
  B: LIT_CYAN_600,
  C: LIT_AMBER_500,
  D: LIT_RED_600,
};

// ─── Pulse mark — re-drawn natively (no asset to embed) ───────────────────
function drawPulseLogo(doc: jsPDF, x: number, y: number, size: number): void {
  const s = size / 64;
  doc.setFillColor(...LIT_NAVY);
  doc.roundedRect(x, y, size, size, size * 0.25, size * 0.25, "F");
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(s * 4.8);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  const pts: Array<[number, number]> = [
    [8, 32], [20, 32], [26, 22], [32, 42], [38, 32], [56, 32],
  ];
  for (let i = 1; i < pts.length; i++) {
    doc.line(x + pts[i - 1][0] * s, y + pts[i - 1][1] * s, x + pts[i][0] * s, y + pts[i][1] * s);
  }
  doc.setFillColor(...LIT_CYAN_NEON);
  doc.circle(x + 56 * s, y + 32 * s, 3 * s, "F");
}

// ─── Types — kept loose because the upstream brief is permissive ──────────
interface ExecutiveOverview {
  tldr?: string[];
  opportunity_grade_letter?: "A" | "B" | "C" | "D";
  opportunity_score_0_to_100?: number;
  key_metrics_snapshot?: {
    shipments_12m?: string;
    teu_12m?: string;
    top_lane?: string;
    top_carrier?: string;
    recent_activity_summary?: string;
    freshness_label?: string;
  };
  pre_call_talking_points?: string[];
  likely_objections?: Array<{ objection: string; response: string }>;
  best_contact_and_approach?: {
    contact_name?: string;
    contact_title?: string;
    channel?: string;
    opening_line?: string;
  };
}

interface BriefReport {
  company_summary?: string;
  why_now?: string;
  sales_angle?: string;
  buying_signals?: string[];
  risk_flags?: string[];
  lane_insights?: string[];
  web_sources?: Array<{ title?: string; url?: string; publisher?: string; published_at?: string; summary?: string }>;
  executive_overview?: ExecutiveOverview;
}

interface ExportArgs {
  companyName: string;
  domain?: string | null;
  industry?: string | null;
  hq?: string | null;
  brief: { report?: BriefReport | null } | null | undefined;
  generatedAt?: Date;
}

// ─── Layout constants (Letter portrait) ───────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 70;
const FOOTER_H = 28;

export function exportPulseExecutivePdf(args: ExportArgs): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const generatedAt = args.generatedAt ?? new Date();
  const ov: ExecutiveOverview = args.brief?.report?.executive_overview ?? {};
  const report: BriefReport = args.brief?.report ?? {};

  // Page 1: Cover — branded hero, grade circle, exec TLDR
  drawCoverPage(doc, args, ov, generatedAt);

  // Page 2: At-a-glance — KPI tiles + opportunity gauge + key metrics
  doc.addPage();
  drawAtAGlancePage(doc, args, ov);

  // Page 3: Why now + buying signals + risk flags
  doc.addPage();
  drawWhyNowPage(doc, report);

  // Page 4: Pre-call talking points
  doc.addPage();
  drawTalkingPointsPage(doc, ov);

  // Page 5: Likely objections + responses
  doc.addPage();
  drawObjectionsPage(doc, ov);

  // Page 6: Best contact + opening line
  doc.addPage();
  drawBestContactPage(doc, ov);

  // Page 7: Trade lane intel
  doc.addPage();
  drawLaneIntelPage(doc, report);

  // Page 8: Sources
  doc.addPage();
  drawSourcesPage(doc, report);

  // Footer on every page after page 1 has the same hero header
  stampHeaderAndFooter(doc, args.companyName);

  const slug = args.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const dateStamp = generatedAt.toISOString().slice(0, 10);
  doc.save(`LIT-Executive-Brief-${slug || "company"}-${dateStamp}.pdf`);
}

// ─── PAGE 1 · Cover ───────────────────────────────────────────────────────
function drawCoverPage(
  doc: jsPDF,
  args: ExportArgs,
  ov: ExecutiveOverview,
  generatedAt: Date,
): void {
  // Full-bleed navy background for the upper third
  doc.setFillColor(...LIT_NAVY);
  doc.rect(0, 0, PAGE_W, 220, "F");
  // Neon cyan accent line
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(2);
  doc.line(0, 220, PAGE_W, 220);

  // Pulse mark + brand wordmark, top-left
  drawPulseLogo(doc, MARGIN, 24, 38);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("LIT  ·  PULSE EXECUTIVE BRIEF", MARGIN + 50, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LIT_CYAN_NEON);
  doc.text("Pre-call account intelligence", MARGIN + 50, 58);

  // Generated stamp, top-right
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LIT_SLATE_400);
  doc.text(
    generatedAt.toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }),
    PAGE_W - MARGIN, 44,
    { align: "right" },
  );
  const freshness = ov.key_metrics_snapshot?.freshness_label;
  if (freshness) {
    doc.setTextColor(...LIT_CYAN_NEON);
    doc.text(freshness, PAGE_W - MARGIN, 58, { align: "right" });
  }

  // Company name (large, white)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(255, 255, 255);
  const companyLines = doc.splitTextToSize(args.companyName, CONTENT_W - 110);
  doc.text(companyLines[0] ?? args.companyName, MARGIN, 130);

  // Sub-meta line: domain · industry · HQ
  const subBits = [args.domain, args.industry, args.hq].filter(Boolean).join(" · ");
  if (subBits) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...LIT_SLATE_400);
    doc.text(subBits, MARGIN, 154);
  }

  // Opportunity grade circle, right side
  const grade = ov.opportunity_grade_letter ?? "—";
  const score = ov.opportunity_score_0_to_100;
  drawGradeCircle(doc, PAGE_W - MARGIN - 60, 92, 50, grade, score);

  // Below the hero: the 3-bullet TLDR card on a light background
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 220, PAGE_W, PAGE_H - 220, "F");

  let y = 260;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...LIT_CYAN_600);
  doc.text("EXECUTIVE TL;DR", MARGIN, y);
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y + 4, MARGIN + 60, y + 4);
  y += 22;

  const tldr = ov.tldr && ov.tldr.length ? ov.tldr : ["—", "—", "—"];
  for (let i = 0; i < tldr.length; i++) {
    const num = String(i + 1).padStart(2, "0");
    doc.setFillColor(...LIT_NAVY);
    doc.roundedRect(MARGIN, y, 28, 28, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...LIT_CYAN_NEON);
    doc.text(num, MARGIN + 14, y + 19, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11.5);
    doc.setTextColor(...LIT_SLATE_900);
    const wrapped = doc.splitTextToSize(tldr[i] ?? "—", CONTENT_W - 40);
    let cy = y + 14;
    for (const line of wrapped) {
      doc.text(line, MARGIN + 40, cy);
      cy += 14;
    }
    y = cy + 12;
  }

  // Footer-strip CTA: "Read in 60 seconds before the call."
  doc.setFillColor(...LIT_NAVY);
  doc.rect(0, PAGE_H - 70, PAGE_W, 70, "F");
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(0.8);
  doc.line(0, PAGE_H - 70, PAGE_W, PAGE_H - 70);
  drawPulseLogo(doc, MARGIN, PAGE_H - 55, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("Read this in 60 seconds. Walk into the call ready.", MARGIN + 32, PAGE_H - 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LIT_CYAN_NEON);
  doc.text("logisticintel.com  ·  Pulse AI", MARGIN + 32, PAGE_H - 28);
}

// Opportunity grade — outlined circle, big letter, score below
function drawGradeCircle(
  doc: jsPDF,
  cx: number, cy: number, r: number,
  grade: string, score?: number,
): void {
  const color = GRADE_COLOR[grade] ?? LIT_SLATE_400;
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r, "F");
  doc.setDrawColor(...color);
  doc.setLineWidth(3);
  doc.circle(cx, cy, r, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(48);
  doc.setTextColor(...color);
  doc.text(grade, cx, cy + 12, { align: "center" });
  if (typeof score === "number" && Number.isFinite(score)) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...LIT_SLATE_400);
    doc.text(`${Math.round(score)} / 100`, cx, cy + 28, { align: "center" });
  }
  doc.setFontSize(7.5);
  doc.setTextColor(...LIT_SLATE_400);
  doc.text("OPPORTUNITY", cx, cy - r - 8, { align: "center" });
}

// ─── PAGE 2 · At-a-glance (infographic KPIs) ──────────────────────────────
function drawAtAGlancePage(doc: jsPDF, args: ExportArgs, ov: ExecutiveOverview): void {
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...LIT_SLATE_900);
  doc.text("At a glance", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...LIT_SLATE_600);
  doc.text("The 6 numbers that frame this call.", MARGIN, y + 16);
  y += 50;

  const km = ov.key_metrics_snapshot ?? {};
  const tiles: Array<{ label: string; value: string }> = [
    { label: "SHIPMENTS · 12M", value: km.shipments_12m ?? "—" },
    { label: "TEU · 12M", value: km.teu_12m ?? "—" },
    { label: "TOP LANE", value: km.top_lane ?? "—" },
    { label: "TOP CARRIER", value: km.top_carrier ?? "—" },
    { label: "RECENT ACTIVITY", value: km.recent_activity_summary ?? "—" },
    { label: "DATA FRESHNESS", value: km.freshness_label ?? "—" },
  ];

  // 3 cols x 2 rows
  const colW = (CONTENT_W - 20) / 3;
  const rowH = 90;
  for (let i = 0; i < tiles.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const tx = MARGIN + col * (colW + 10);
    const ty = y + row * (rowH + 12);
    // Tile background
    doc.setFillColor(...LIT_NAVY);
    doc.roundedRect(tx, ty, colW, rowH, 10, 10, "F");
    doc.setDrawColor(...LIT_CYAN_NEON);
    doc.setLineWidth(0.6);
    doc.line(tx + 16, ty + rowH - 12, tx + 38, ty + rowH - 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...LIT_CYAN_NEON);
    doc.text(tiles[i].label, tx + 14, ty + 22);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    const wrapped = doc.splitTextToSize(tiles[i].value, colW - 28);
    let vy = ty + 44;
    for (const line of wrapped.slice(0, 2)) {
      doc.text(line, tx + 14, vy);
      vy += 18;
    }
  }
  y += rowH * 2 + 30;

  // Opportunity gauge — visual bar instead of arc (more readable on print)
  const score = ov.opportunity_score_0_to_100;
  if (typeof score === "number") {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...LIT_CYAN_600);
    doc.text("OPPORTUNITY GAUGE", MARGIN, y);
    doc.setDrawColor(...LIT_CYAN_NEON);
    doc.setLineWidth(1.2);
    doc.line(MARGIN, y + 4, MARGIN + 80, y + 4);
    y += 24;

    const gaugeW = CONTENT_W;
    const gaugeH = 18;
    // Background track
    doc.setFillColor(...LIT_SLATE_200);
    doc.roundedRect(MARGIN, y, gaugeW, gaugeH, gaugeH / 2, gaugeH / 2, "F");
    // Filled portion
    const fillW = Math.max(gaugeH, (gaugeW * Math.min(100, Math.max(0, score))) / 100);
    const grade = ov.opportunity_grade_letter ?? "C";
    const color = GRADE_COLOR[grade] ?? LIT_CYAN_600;
    doc.setFillColor(...color);
    doc.roundedRect(MARGIN, y, fillW, gaugeH, gaugeH / 2, gaugeH / 2, "F");
    // Tick markers + labels
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...LIT_SLATE_400);
    const ticks = [0, 25, 50, 75, 100];
    for (const t of ticks) {
      const tx = MARGIN + (gaugeW * t) / 100;
      doc.text(String(t), tx, y + gaugeH + 12, { align: "center" });
    }
    // Score callout, top of gauge
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...LIT_SLATE_900);
    doc.text(`${Math.round(score)} / 100  ·  Grade ${grade}`, MARGIN, y - 6);
  }
}

// ─── PAGE 3 · Why now + buying signals + risk flags ───────────────────────
function drawWhyNowPage(doc: jsPDF, report: BriefReport): void {
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...LIT_SLATE_900);
  doc.text("Why now", MARGIN, y);
  y += 30;

  if (report.why_now) {
    y = drawParagraph(doc, report.why_now, y);
    y += 12;
  }
  if (report.sales_angle) {
    y = drawSection(doc, "SALES ANGLE", LIT_CYAN_600, y);
    y = drawParagraph(doc, report.sales_angle, y);
    y += 18;
  }
  if (report.buying_signals?.length) {
    y = drawSection(doc, "BUYING SIGNALS", LIT_EMERALD_600, y);
    y = drawChipList(doc, report.buying_signals, LIT_EMERALD_600, y);
    y += 18;
  }
  if (report.risk_flags?.length) {
    y = drawSection(doc, "RISK FLAGS", LIT_RED_600, y);
    y = drawChipList(doc, report.risk_flags, LIT_RED_600, y);
  }
}

// ─── PAGE 4 · Pre-call talking points ─────────────────────────────────────
function drawTalkingPointsPage(doc: jsPDF, ov: ExecutiveOverview): void {
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...LIT_SLATE_900);
  doc.text("Pre-call talking points", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...LIT_SLATE_600);
  doc.text("Read these in the first 90 seconds. Order matters.", MARGIN, y + 16);
  y += 50;

  const items = ov.pre_call_talking_points ?? [];
  if (!items.length) {
    drawPlaceholder(doc, "Refresh the brief to generate pre-call talking points.", y);
    return;
  }
  for (let i = 0; i < items.length; i++) {
    // Number badge
    doc.setFillColor(...LIT_NAVY);
    doc.roundedRect(MARGIN, y - 4, 30, 30, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...LIT_CYAN_NEON);
    doc.text(String(i + 1), MARGIN + 15, y + 16, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...LIT_SLATE_900);
    const wrapped = doc.splitTextToSize(items[i], CONTENT_W - 50);
    let ly = y + 14;
    for (const line of wrapped) {
      doc.text(line, MARGIN + 44, ly);
      ly += 16;
    }
    y = ly + 16;
  }
}

// ─── PAGE 5 · Likely objections ───────────────────────────────────────────
function drawObjectionsPage(doc: jsPDF, ov: ExecutiveOverview): void {
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...LIT_SLATE_900);
  doc.text("Likely objections", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...LIT_SLATE_600);
  doc.text("What they'll push back on — and how to land the response.", MARGIN, y + 16);
  y += 50;

  const items = ov.likely_objections ?? [];
  if (!items.length) {
    drawPlaceholder(doc, "Refresh the brief to generate likely objections.", y);
    return;
  }
  for (const it of items) {
    // Objection card
    doc.setFillColor(...LIT_CYAN_50);
    doc.roundedRect(MARGIN, y, CONTENT_W, 64, 8, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...LIT_CYAN_600);
    doc.text("OBJECTION", MARGIN + 14, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...LIT_SLATE_900);
    const obj = doc.splitTextToSize(it.objection, CONTENT_W - 28);
    let oy = y + 34;
    for (const line of obj) {
      doc.text(line, MARGIN + 14, oy);
      oy += 14;
    }
    const objH = Math.max(64, oy - y + 8);

    // Response card
    const ry = y + objH + 6;
    doc.setFillColor(...LIT_NAVY);
    doc.roundedRect(MARGIN, ry, CONTENT_W, 64, 8, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...LIT_CYAN_NEON);
    doc.text("YOUR RESPONSE", MARGIN + 14, ry + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    const resp = doc.splitTextToSize(it.response, CONTENT_W - 28);
    let ry2 = ry + 34;
    for (const line of resp) {
      doc.text(line, MARGIN + 14, ry2);
      ry2 += 14;
    }
    const respH = Math.max(64, ry2 - ry + 8);
    y = ry + respH + 16;
  }
}

// ─── PAGE 6 · Best contact ────────────────────────────────────────────────
function drawBestContactPage(doc: jsPDF, ov: ExecutiveOverview): void {
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...LIT_SLATE_900);
  doc.text("Who to call first", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...LIT_SLATE_600);
  doc.text("The single highest-leverage opener.", MARGIN, y + 16);
  y += 60;

  const c = ov.best_contact_and_approach ?? {};
  if (!c.contact_name && !c.opening_line) {
    drawPlaceholder(doc, "Refresh the brief to generate the best-contact recommendation.", y);
    return;
  }

  // Contact card
  doc.setFillColor(...LIT_NAVY);
  doc.roundedRect(MARGIN, y, CONTENT_W, 140, 12, 12, "F");

  // Initials avatar
  const initials = (c.contact_name ?? "?")
    .split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  doc.setFillColor(...LIT_CYAN_NEON);
  doc.circle(MARGIN + 50, y + 70, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...LIT_NAVY);
  doc.text(initials, MARGIN + 50, y + 78, { align: "center" });

  // Name + title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(c.contact_name ?? "—", MARGIN + 100, y + 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...LIT_CYAN_NEON);
  doc.text(c.contact_title ?? "—", MARGIN + 100, y + 80);

  // Channel chip
  if (c.channel) {
    doc.setFillColor(...LIT_CYAN_NEON);
    doc.roundedRect(MARGIN + 100, y + 92, 70, 18, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...LIT_NAVY);
    doc.text(c.channel.toUpperCase(), MARGIN + 135, y + 104, { align: "center" });
  }

  y += 160;

  // Opening line block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...LIT_CYAN_600);
  doc.text("OPENING LINE", MARGIN, y);
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y + 4, MARGIN + 60, y + 4);
  y += 22;

  doc.setFillColor(...LIT_CYAN_50);
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(0.6);
  // Light quote-block
  const line = c.opening_line ?? "—";
  const wrapped = doc.splitTextToSize(line, CONTENT_W - 28);
  const blockH = Math.max(70, wrapped.length * 16 + 28);
  doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 8, 8, "FD");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(12);
  doc.setTextColor(...LIT_SLATE_900);
  let qy = y + 22;
  for (const w of wrapped) {
    doc.text(`"${qy === y + 22 ? w : "  " + w}"`.replace(/^""$/, ""), MARGIN + 14, qy);
    qy += 16;
  }
}

// ─── PAGE 7 · Trade lane intel (existing report data) ─────────────────────
function drawLaneIntelPage(doc: jsPDF, report: BriefReport): void {
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...LIT_SLATE_900);
  doc.text("Trade lane intel", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...LIT_SLATE_600);
  doc.text("Where the freight actually moves.", MARGIN, y + 16);
  y += 50;

  const lanes = report.lane_insights ?? [];
  if (!lanes.length) {
    drawPlaceholder(doc, "No lane insights available in this brief.", y);
    return;
  }
  // Render as a numbered, accented list
  for (let i = 0; i < lanes.length; i++) {
    // Lane chip on the left
    doc.setFillColor(...LIT_CYAN_50);
    doc.setDrawColor(...LIT_CYAN_NEON);
    doc.setLineWidth(0.4);
    const wrapped = doc.splitTextToSize(lanes[i], CONTENT_W - 50);
    const cardH = wrapped.length * 14 + 24;
    doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 6, 6, "FD");
    // Number circle
    doc.setFillColor(...LIT_NAVY);
    doc.circle(MARGIN + 18, y + 18, 11, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...LIT_CYAN_NEON);
    doc.text(String(i + 1), MARGIN + 18, y + 22, { align: "center" });
    // Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...LIT_SLATE_900);
    let cy = y + 16;
    for (const line of wrapped) {
      doc.text(line, MARGIN + 38, cy);
      cy += 14;
    }
    y += cardH + 8;
    if (y > PAGE_H - 100) break;
  }
}

// ─── PAGE 8 · Sources (every web URL cited) ───────────────────────────────
function drawSourcesPage(doc: jsPDF, report: BriefReport): void {
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...LIT_SLATE_900);
  doc.text("Sources", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...LIT_SLATE_600);
  doc.text("Every web claim above is backed by one of these.", MARGIN, y + 16);
  y += 50;

  const sources = report.web_sources ?? [];
  if (!sources.length) {
    drawPlaceholder(doc, "This brief did not cite any web sources.", y);
    return;
  }
  autoTable(doc, {
    startY: y,
    head: [["#", "Source", "Published"]],
    body: sources.map((s, i) => [
      String(i + 1),
      `${s.title ?? s.publisher ?? "Untitled"}\n${s.url ?? ""}`,
      s.published_at ?? "—",
    ]),
    headStyles: { fillColor: LIT_NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: LIT_SLATE_900 },
    alternateRowStyles: { fillColor: LIT_CYAN_50 },
    columnStyles: {
      0: { halign: "center", cellWidth: 30 },
      2: { halign: "right", cellWidth: 80 },
    },
    margin: { left: MARGIN, right: MARGIN },
    theme: "striped",
    styles: { lineColor: LIT_SLATE_200, lineWidth: 0.3 },
  });
}

// ─── Header + footer on every page after cover ────────────────────────────
function stampHeaderAndFooter(doc: jsPDF, companyName: string): void {
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    // Top header strip — thin navy ribbon w/ mark
    doc.setFillColor(...LIT_NAVY);
    doc.rect(0, 0, PAGE_W, 36, "F");
    doc.setDrawColor(...LIT_CYAN_NEON);
    doc.setLineWidth(0.6);
    doc.line(0, 36, PAGE_W, 36);
    drawPulseLogo(doc, MARGIN, 7, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...LIT_CYAN_NEON);
    doc.text("LIT  ·  EXECUTIVE BRIEF", MARGIN + 30, 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...LIT_SLATE_400);
    doc.text(companyName, PAGE_W - MARGIN, 22, { align: "right" });
  }
  // Footer on EVERY page (including cover)
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) {
      // Pages 2+: simple footer
      doc.setFillColor(...LIT_NAVY);
      doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, "F");
      doc.setDrawColor(...LIT_CYAN_NEON);
      doc.setLineWidth(0.6);
      doc.line(0, PAGE_H - FOOTER_H, PAGE_W, PAGE_H - FOOTER_H);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("LIT  ·  PULSE EXECUTIVE BRIEF", MARGIN, PAGE_H - FOOTER_H + 17);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...LIT_CYAN_NEON);
      doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - FOOTER_H + 17, { align: "right" });
    }
  }
}

// ─── Small drawing helpers ────────────────────────────────────────────────
function drawSection(doc: jsPDF, label: string, color: [number, number, number], y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...color);
  doc.text(label, MARGIN, y);
  doc.setDrawColor(...color);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y + 4, MARGIN + 50, y + 4);
  return y + 22;
}

function drawParagraph(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...LIT_SLATE_900);
  const lines = doc.splitTextToSize(text, CONTENT_W);
  for (const line of lines) {
    if (y > PAGE_H - 80) { doc.addPage(); y = 100; }
    doc.text(line, MARGIN, y);
    y += 14;
  }
  return y;
}

function drawChipList(
  doc: jsPDF,
  items: string[],
  color: [number, number, number],
  y: number,
): number {
  for (const item of items) {
    if (y > PAGE_H - 80) { doc.addPage(); y = 100; }
    // Dot bullet
    doc.setFillColor(...color);
    doc.circle(MARGIN + 3, y - 3, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...LIT_SLATE_900);
    const wrapped = doc.splitTextToSize(item, CONTENT_W - 16);
    for (let i = 0; i < wrapped.length; i++) {
      doc.text(wrapped[i], MARGIN + 14, y);
      y += 13;
    }
    y += 4;
  }
  return y;
}

function drawPlaceholder(doc: jsPDF, msg: string, y: number): void {
  doc.setFillColor(...LIT_CYAN_50);
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN, y, CONTENT_W, 80, 8, 8, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...LIT_SLATE_600);
  doc.text(msg, MARGIN + 16, y + 44);
}
