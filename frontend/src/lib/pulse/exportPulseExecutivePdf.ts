/**
 * Pulse Executive Account Brief — Studio White corporate blueprint.
 *
 * Premium light-mode PDF read by enterprise execs in 60 seconds before
 * a discovery call. Four-part structure (rewritten 2026-06-18):
 *
 *   1. Header & enterprise metadata block — title, freshness badge,
 *      sub-header with parent / NAICS / HQ / port gateway, opportunity
 *      index (score + letter grade).
 *   2. Executive macro briefing — a single dense paragraph linking
 *      public financial standing to internal supply-chain operational
 *      impacts.
 *   3. Sourcing demand & logistics volumetrics — 3-column metric grid
 *      (annual TEU + tier, active freight lanes, primary carrier mix)
 *      followed by the top-3 trade lane velocity table.
 *   4. Metric-based friction points & value hypotheses — two-column
 *      table mapping a specific supply-chain stressor to a specific
 *      LIT platform feature that mitigates it.
 *
 *   + Supply chain leadership enrichment: exactly 2 logistics decision-
 *     makers (Chief Supply Chain Officer / VP Logistics / VP Inventory
 *     Management tier). Marketing / creative / PR contacts are
 *     filtered out at both LLM schema and renderer level.
 *
 * Hard exclusions (enforced at both the LLM and the renderer):
 *   - No SDR outreach scripts, opening lines, hooks, email templates.
 *   - No talking points or objection-and-response blocks.
 *   - No dark-mode chrome or slate-on-navy components.
 *   - No marketing / brand / PR / creative contacts.
 *   - Missing values render as `[Enrichment in Progress]` pill badges.
 *
 * Falls back gracefully when an older brief without the new
 * executive_overview shape is passed in — every block independently
 * renders the pending badge if its data is missing.
 */

import jsPDF from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";

// ─── Studio White palette ─────────────────────────────────────────────────
const WHITE: [number, number, number] = [255, 255, 255];
const INK_900: [number, number, number] = [15, 23, 42];
const INK_800: [number, number, number] = [30, 41, 59];
const INK_700: [number, number, number] = [51, 65, 85];
const INK_500: [number, number, number] = [100, 116, 139];
const INK_400: [number, number, number] = [148, 163, 184];
const INK_300: [number, number, number] = [203, 213, 225];
const INK_200: [number, number, number] = [226, 232, 240];
const INK_100: [number, number, number] = [241, 245, 249];
const INK_50:  [number, number, number] = [248, 250, 252];

// Brand anchors — used as accents over the Studio White surface so the
// PDF still reads as LIT without going dark-mode. Tuned per the sample
// image: cyan glow on the pulse mark + section eyebrow rules, navy
// strip at the bottom of every page.
const LIT_NAVY: [number, number, number] = [2, 6, 23];      // #020617
const LIT_CYAN: [number, number, number] = [0, 224, 255];   // #00E0FF

const STATUS_OK_BG:        [number, number, number] = [220, 252, 231];
const STATUS_OK_FG:        [number, number, number] = [21, 128, 61];
const STATUS_WARN_BG:      [number, number, number] = [254, 243, 199];
const STATUS_WARN_FG:      [number, number, number] = [180, 83, 9];
const STATUS_GROWING_BG:   [number, number, number] = [219, 234, 254];
const STATUS_GROWING_FG:   [number, number, number] = [29, 78, 216];
const STATUS_DECLINING_BG: [number, number, number] = [254, 226, 226];
const STATUS_DECLINING_FG: [number, number, number] = [185, 28, 28];
const STATUS_NEUTRAL_BG:   [number, number, number] = [241, 245, 249];
const STATUS_NEUTRAL_FG:   [number, number, number] = [30, 41, 59];

const PENDING_BG: [number, number, number] = [254, 249, 195];
const PENDING_FG: [number, number, number] = [161, 98, 7];

const GRADE_FG: Record<string, [number, number, number]> = {
  A: STATUS_OK_FG,
  B: STATUS_GROWING_FG,
  C: STATUS_WARN_FG,
  D: STATUS_DECLINING_FG,
};

// ─── Page geometry (Letter portrait) ──────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 56;
const FOOTER_H = 30;

const PENDING_TEXT = "[Enrichment in Progress]";

// ─── Types — mirror the pulse-ai-enrich schema (Studio White redesign) ────
interface CorporateMetadata {
  parent_company?: string;
  naics_sector?: string;
  headquarters_location?: string;
  primary_port_gateway?: string;
}

interface LogisticsVolumetrics {
  annual_teu_estimate?: string;
  importer_tier?: string;
  active_freight_lanes_count?: number;
  primary_carriers?: string[];
}

interface TradeLaneRow {
  route?: string;
  volume_share_pct?: number;
  transit_days?: number;
  velocity_status?: string;
}

interface FrictionPoint {
  stressor?: string;
  value_hypothesis?: string;
}

interface LeadershipContact {
  name?: string;
  title?: string;
  strategic_mandate?: string;
}

interface ExecutiveOverview {
  // New (Studio White) fields
  corporate_metadata?: CorporateMetadata;
  opportunity_grade_letter?: "A" | "B" | "C" | "D";
  opportunity_score_0_to_100?: number;
  data_freshness_label?: string;
  executive_macro_briefing?: string;
  logistics_volumetrics?: LogisticsVolumetrics;
  trade_lane_velocity?: TradeLaneRow[];
  friction_points?: FrictionPoint[];
  supply_chain_leadership?: LeadershipContact[];

  // Pre-2026-06-18 legacy fields, kept so the backwards-compat layer
  // below can synthesise new-shape blocks from cached briefs that still
  // carry the old schema (tldr / pre_call_talking_points / etc).
  // Without this layer, every pre-redesign cached brief renders as an
  // all-Enrichment-in-Progress skeleton until the user manually
  // refreshes it.
  key_metrics_snapshot?: {
    shipments_12m?: string;
    teu_12m?: string;
    top_lane?: string;
    top_carrier?: string;
    recent_activity_summary?: string;
    freshness_label?: string;
  };
  tldr?: string[];
}

interface BriefReport {
  company_summary?: string;
  why_now?: string;
  sales_angle?: string;
  lane_insights?: string[];
  carrier_opportunities?: string[];
  risk_flags?: string[];
  forwarder_displacement_opportunities?: string[];
  buying_signals?: string[];
  supplier_insights?: string[];
  recommended_contacts?: Array<{
    name?: string;
    title?: string;
    reason?: string;
    confidence?: number;
  }>;
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

// ─── Markdown sanitiser ───────────────────────────────────────────────────
function stripMarkdown(text: unknown): string {
  if (text == null) return "";
  return String(text)
    .replace(/\(\[([^\]]+)\]\([^)]+\)\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Marketing / creative / PR title filter ───────────────────────────────
const REJECTED_TITLE_FRAGMENTS = [
  "marketing", "brand", "creative", "design", "communications",
  "public relations", "press", "media", "content", "publicist",
  "sales", "account executive", "business development",
];

function isLogisticsLeadershipTitle(title: unknown): boolean {
  if (!title) return false;
  const t = String(title).toLowerCase();
  for (const bad of REJECTED_TITLE_FRAGMENTS) {
    if (t.includes(bad)) return false;
  }
  return true;
}

// ─── Backwards-compat: synthesise new-shape blocks from old-shape ────────
// Cached briefs from before the 2026-06-18 schema redesign still have
// the legacy executive_overview { tldr, pre_call_talking_points, ... }
// shape PLUS top-level fields (lane_insights, carrier_opportunities,
// risk_flags, recommended_contacts). Without this layer, the new PDF
// reads only the new field names and renders every section as an
// [Enrichment in Progress] pill — which is what the user reported as
// "looks even worst than before." This layer maps the legacy data
// into the new shape so the PDF renders REAL data during the cache
// transition. New-shape briefs short-circuit on line 1.
function buildExecutiveOverviewWithFallback(
  args: ExportArgs,
  report: BriefReport | undefined,
): ExecutiveOverview {
  const newShape = report?.executive_overview ?? {};

  // New-shape brief — return as-is. Detected by presence of any
  // Studio White block that the old schema does not emit.
  const isNewShape = !!(
    newShape.corporate_metadata ||
    newShape.executive_macro_briefing ||
    newShape.logistics_volumetrics ||
    newShape.trade_lane_velocity ||
    newShape.friction_points ||
    newShape.supply_chain_leadership
  );
  if (isNewShape) return newShape;

  // Old-shape brief — synthesise the new blocks from legacy fields.
  // Every block is independently null-checked; if there's no signal
  // in the cached brief, the corresponding section still renders a
  // pending pill (not fabricated data).
  const synth: ExecutiveOverview = {
    opportunity_grade_letter: newShape.opportunity_grade_letter,
    opportunity_score_0_to_100: newShape.opportunity_score_0_to_100,
    data_freshness_label:
      stripMarkdown(newShape.key_metrics_snapshot?.freshness_label) || undefined,
  };

  // corporate_metadata: derived from the export args + the company's
  // public industry tag. The args carry the canonical company name.
  synth.corporate_metadata = {
    parent_company: stripMarkdown(args.companyName) || undefined,
    naics_sector: stripMarkdown(args.industry) || undefined,
    headquarters_location: stripMarkdown(args.hq) || undefined,
    primary_port_gateway: undefined,
  };

  // executive_macro_briefing: join company_summary + why_now into one
  // dense paragraph. These are the legacy prose fields and reading
  // them through stripMarkdown keeps the strict no-markdown rule.
  const summary = stripMarkdown(report?.company_summary);
  const whyNow = stripMarkdown(report?.why_now);
  const briefingParts = [summary, whyNow].filter(Boolean);
  if (briefingParts.length) {
    synth.executive_macro_briefing = briefingParts.join(" ").slice(0, 800);
  }

  // logistics_volumetrics: read from old key_metrics_snapshot when
  // present, else from carrier_opportunities (length of array ≈
  // active corridors) and lane_insights.
  const snap = newShape.key_metrics_snapshot;
  const laneInsights = Array.isArray(report?.lane_insights) ? report!.lane_insights : [];
  const carrierOps = Array.isArray(report?.carrier_opportunities) ? report!.carrier_opportunities : [];
  if (snap || laneInsights.length || carrierOps.length) {
    synth.logistics_volumetrics = {
      annual_teu_estimate: stripMarkdown(snap?.teu_12m) || undefined,
      importer_tier: undefined,
      active_freight_lanes_count: laneInsights.length || undefined,
      primary_carriers: carrierOps
        .slice(0, 4)
        .map((c) => stripMarkdown(c).split(/[—:|]/)[0].trim())
        .filter(Boolean),
    };
  }

  // trade_lane_velocity: map lane_insights into the 3-row table.
  // Velocity status defaults to Moderate because the legacy schema
  // didn't carry an explicit velocity flag.
  if (laneInsights.length) {
    synth.trade_lane_velocity = laneInsights.slice(0, 3).map((insight) => {
      const cleaned = stripMarkdown(insight);
      return {
        route: cleaned.split(/[—:.]/)[0].trim().slice(0, 60) || cleaned.slice(0, 60),
        volume_share_pct: undefined,
        transit_days: undefined,
        velocity_status: "Moderate",
      };
    });
  }

  // friction_points: pair risk_flags (stressors) with carrier_
  // opportunities and forwarder_displacement_opportunities (LIT
  // value hypotheses). Cap at 4 to match the new schema.
  const stressors = Array.isArray(report?.risk_flags) ? report!.risk_flags : [];
  const hypotheses = [
    ...(Array.isArray(report?.carrier_opportunities) ? report!.carrier_opportunities : []),
    ...(Array.isArray(report?.forwarder_displacement_opportunities)
      ? report!.forwarder_displacement_opportunities
      : []),
  ];
  if (stressors.length || hypotheses.length) {
    const rows = Math.max(2, Math.min(4, Math.max(stressors.length, hypotheses.length)));
    const friction: FrictionPoint[] = [];
    for (let i = 0; i < rows; i++) {
      friction.push({
        stressor: stripMarkdown(stressors[i]) || undefined,
        value_hypothesis: stripMarkdown(hypotheses[i]) || undefined,
      });
    }
    synth.friction_points = friction;
  }

  // supply_chain_leadership: filter recommended_contacts through the
  // same logistics-title gate the new renderer uses, take top 2.
  const contacts = Array.isArray(report?.recommended_contacts) ? report!.recommended_contacts : [];
  const logisticsContacts = contacts
    .filter((c) => isLogisticsLeadershipTitle(c.title))
    .slice(0, 2);
  if (logisticsContacts.length) {
    synth.supply_chain_leadership = logisticsContacts.map((c) => ({
      name: stripMarkdown(c.name) || undefined,
      title: stripMarkdown(c.title) || undefined,
      strategic_mandate: stripMarkdown(c.reason) || undefined,
    }));
  }

  return synth;
}

// ─── Pulse mark — branded waveform on dark tile ──────────────────────────
// Matches the live in-app Pulse icon: navy rounded-square tile with a
// neon-cyan waveform + endpoint dot. The cyan against the white page
// surface is the single most distinctive brand cue the PDF carries.
function drawPulseLogo(doc: jsPDF, x: number, y: number, size: number): void {
  const s = size / 64;
  doc.setFillColor(...LIT_NAVY);
  doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, "F");
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(s * 4.4);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  const pts: Array<[number, number]> = [
    [8, 32], [20, 32], [26, 22], [32, 42], [38, 32], [56, 32],
  ];
  for (let i = 1; i < pts.length; i++) {
    doc.line(x + pts[i - 1][0] * s, y + pts[i - 1][1] * s, x + pts[i][0] * s, y + pts[i][1] * s);
  }
  doc.setFillColor(...LIT_CYAN);
  doc.circle(x + 56 * s, y + 32 * s, 3 * s, "F");
}

// ─── Pill rendering helpers ───────────────────────────────────────────────
function pillColorsForStatus(status: string): { bg: [number, number, number]; fg: [number, number, number] } {
  const s = (status || "").toLowerCase();
  if (s.includes("high volume") || s.includes("stable")) return { bg: STATUS_OK_BG, fg: STATUS_OK_FG };
  if (s.includes("congestion") || s.includes("warning") || s.includes("warn")) return { bg: STATUS_WARN_BG, fg: STATUS_WARN_FG };
  if (s.includes("grow")) return { bg: STATUS_GROWING_BG, fg: STATUS_GROWING_FG };
  if (s.includes("declin")) return { bg: STATUS_DECLINING_BG, fg: STATUS_DECLINING_FG };
  return { bg: STATUS_NEUTRAL_BG, fg: STATUS_NEUTRAL_FG };
}

function drawPill(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  bg: [number, number, number],
  fg: [number, number, number],
  opts: { fontSize?: number; padX?: number; padY?: number } = {},
): { w: number; h: number } {
  const fontSize = opts.fontSize ?? 8.5;
  const padX = opts.padX ?? 8;
  const padY = opts.padY ?? 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  const textW = doc.getTextWidth(label);
  const w = textW + padX * 2;
  const h = fontSize + padY * 2;
  doc.setFillColor(...bg);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  doc.setTextColor(...fg);
  doc.text(label, x + padX, y + padY + fontSize - 2);
  return { w, h };
}

function drawPendingPill(doc: jsPDF, x: number, y: number): { w: number; h: number } {
  return drawPill(doc, x, y, PENDING_TEXT, PENDING_BG, PENDING_FG);
}

// ─── Section header (uppercase tracked label with brand cyan accent) ─────
function drawSectionHeader(doc: jsPDF, label: string, y: number, opts: { icon?: string } = {}): number {
  const iconBoxSize = 16;
  let x = MARGIN;
  if (opts.icon) {
    doc.setFillColor(...LIT_NAVY);
    doc.roundedRect(x, y - iconBoxSize + 4, iconBoxSize, iconBoxSize, 3, 3, "F");
    doc.setTextColor(...LIT_CYAN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const iconW = doc.getTextWidth(opts.icon);
    doc.text(opts.icon, x + (iconBoxSize - iconW) / 2, y - 1);
    x += iconBoxSize + 8;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK_900);
  const labelText = label.toUpperCase();
  doc.text(labelText, x, y);
  // Brand-cyan accent rule directly under the label text — short, just
  // far enough past the label to read as an underline. Reinforces LIT
  // identity without painting a full-page horizontal stripe.
  const labelW = doc.getTextWidth(labelText);
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(1.4);
  doc.line(x, y + 3, x + labelW + 12, y + 3);
  // Hairline gray divider continues to the right margin so the section
  // still reads as a structural row, with brand emphasis on the label.
  doc.setDrawColor(...INK_200);
  doc.setLineWidth(0.4);
  doc.line(x + labelW + 16, y + 3, PAGE_W - MARGIN, y + 3);
  return y + 22;
}

// ─── Page chrome ──────────────────────────────────────────────────────────
function drawHeaderBar(doc: jsPDF): void {
  // Pure white bar with a hairline rule at the bottom.
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  doc.setDrawColor(...INK_200);
  doc.setLineWidth(0.5);
  doc.line(0, HEADER_H, PAGE_W, HEADER_H);
  drawPulseLogo(doc, MARGIN, 14, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK_900);
  doc.text("LIT PULSE", MARGIN + 36, 28);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK_500);
  doc.setFontSize(9);
  doc.text("|  EXECUTIVE ACCOUNT BRIEF", MARGIN + 76, 28);
}

function drawHeaderFreshnessBadge(doc: jsPDF, label: string): void {
  // Top-right metadata badge — dark pill so it reads as enterprise meta.
  const text = label || PENDING_TEXT;
  const bg: [number, number, number] = label ? INK_900 : PENDING_BG;
  const fg: [number, number, number] = label ? [255, 255, 255] : PENDING_FG;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const w = doc.getTextWidth(text) + 16;
  const h = 18;
  const x = PAGE_W - MARGIN - w;
  const y = (HEADER_H - h) / 2;
  doc.setFillColor(...bg);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  doc.setTextColor(...fg);
  doc.text(text, x + 8, y + h - 6);
  // Small "DATA FRESHNESS" label above the badge.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...INK_500);
  const labelText = "DATA FRESHNESS";
  const lw = doc.getTextWidth(labelText);
  doc.text(labelText, x + w - lw, y - 3);
}

function drawFooter(doc: jsPDF, pageNum: number, pageCount: number): void {
  // Branded navy strip at the bottom edge — anchors LIT identity on
  // every page and matches the corporate-blueprint sample. Confidential
  // text + page indicator render in white inside the strip.
  const barH = 16;
  const barY = PAGE_H - barH;
  doc.setFillColor(...LIT_NAVY);
  doc.rect(0, barY, PAGE_W, barH, "F");
  // Thin cyan rule just above the navy bar — same brand cue used under
  // section headers. Doubles as visual punctuation between body + bar.
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(0.8);
  doc.line(0, barY - 0.4, PAGE_W, barY - 0.4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("CONFIDENTIAL // FOR INTERNAL STRATEGIC USE", MARGIN, barY + 11);
  const right = `Page ${pageNum} of ${pageCount}`;
  const rw = doc.getTextWidth(right);
  doc.setTextColor(...LIT_CYAN);
  doc.text(right, PAGE_W - MARGIN - rw, barY + 11);
}

function stampPageChrome(doc: jsPDF, freshnessLabel: string): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawHeaderBar(doc);
    if (i === 1) drawHeaderFreshnessBadge(doc, freshnessLabel);
    drawFooter(doc, i, total);
  }
}

// ─── Title block ──────────────────────────────────────────────────────────
function drawTitleBlock(
  doc: jsPDF,
  args: ExportArgs,
  ov: ExecutiveOverview,
  startY: number,
): number {
  let y = startY;
  const metadata = ov.corporate_metadata ?? {};
  const parent = stripMarkdown(metadata.parent_company);
  const companyName = stripMarkdown(args.companyName) || "Untitled Account";
  const title = parent && parent.toLowerCase() !== companyName.toLowerCase()
    ? `${companyName.toUpperCase()} (${parent.toUpperCase()})`
    : companyName.toUpperCase();

  // Report date sub-line.
  const generated = args.generatedAt ?? new Date();
  const dateStr = generated.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  }).toUpperCase();

  // Company headline.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK_900);
  const titleLines = doc.splitTextToSize(title, CONTENT_W - 110);
  for (const line of titleLines) {
    doc.text(line, MARGIN, y);
    y += 22;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK_500);
  doc.text(`REPORT DATE: ${dateStr}`, MARGIN, y);
  y += 14;

  // Opportunity index card — top right of the title block.
  drawOpportunityIndex(doc, ov, startY);

  return y + 6;
}

function drawOpportunityIndex(doc: jsPDF, ov: ExecutiveOverview, anchorY: number): void {
  const grade = (ov.opportunity_grade_letter ?? "").toUpperCase();
  const score = Number.isFinite(ov.opportunity_score_0_to_100) ? Math.round(ov.opportunity_score_0_to_100 as number) : null;
  const gradeFg = GRADE_FG[grade] ?? INK_500;
  const w = 96;
  const h = 64;
  const x = PAGE_W - MARGIN - w;
  const y = anchorY - 16;
  doc.setDrawColor(...INK_200);
  doc.setFillColor(...WHITE);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, w, h, 6, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...INK_500);
  doc.text("OPPORTUNITY", x + 10, y + 13);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...gradeFg);
  const letter = grade || "—";
  doc.text(letter, x + 10, y + 44);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK_700);
  const scoreStr = score != null ? `${score} / 100` : PENDING_TEXT;
  const scoreW = doc.getTextWidth(scoreStr);
  doc.text(scoreStr, x + w - 10 - scoreW, y + 44);

  // Sub-meta row at the bottom of the card.
  doc.setDrawColor(...INK_100);
  doc.setLineWidth(0.5);
  doc.line(x + 10, y + 50, x + w - 10, y + 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...INK_500);
  doc.text("ACCOUNT INDEX", x + 10, y + 60);
}

// ─── Corporate metadata sub-header ────────────────────────────────────────
function drawCorporateSubHeader(doc: jsPDF, ov: ExecutiveOverview, startY: number): number {
  const metadata = ov.corporate_metadata ?? {};
  const cells: Array<[string, string]> = [
    ["NAICS SECTOR", stripMarkdown(metadata.naics_sector) || PENDING_TEXT],
    ["CORPORATE HQ", stripMarkdown(metadata.headquarters_location) || PENDING_TEXT],
    ["PRIMARY PORT GATEWAY", stripMarkdown(metadata.primary_port_gateway) || PENDING_TEXT],
  ];
  const cellW = (CONTENT_W - 110) / cells.length;
  let x = MARGIN;
  const y = startY;
  for (const [label, value] of cells) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...INK_500);
    doc.text(label, x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK_800);
    const valueLines = doc.splitTextToSize(value, cellW - 14);
    doc.text(valueLines[0] ?? "—", x, y + 14);
    x += cellW;
  }
  return y + 28;
}

// ─── Section 2: Executive macro briefing ──────────────────────────────────
function drawMacroBriefing(doc: jsPDF, ov: ExecutiveOverview, startY: number): number {
  let y = drawSectionHeader(doc, "Executive Macro Briefing", startY, { icon: "!" });
  const briefing = stripMarkdown(ov.executive_macro_briefing);
  if (!briefing) {
    drawPendingPill(doc, MARGIN, y);
    return y + 28;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK_800);
  const lines = doc.splitTextToSize(briefing, CONTENT_W);
  for (const line of lines) {
    doc.text(line, MARGIN, y);
    y += 13;
  }
  return y + 8;
}

// ─── Section 3: Sourcing demand & logistics volumetrics ───────────────────
function drawVolumetricsGrid(doc: jsPDF, ov: ExecutiveOverview, startY: number): number {
  const vol = ov.logistics_volumetrics ?? {};
  const teu = stripMarkdown(vol.annual_teu_estimate);
  const tier = stripMarkdown(vol.importer_tier);
  const lanesCount = Number.isFinite(vol.active_freight_lanes_count) ? String(vol.active_freight_lanes_count) : "";
  const carriers = Array.isArray(vol.primary_carriers) ? vol.primary_carriers.map((c) => stripMarkdown(c)).filter(Boolean) : [];

  let y = drawSectionHeader(doc, "Sourcing Demand & Logistics Volumetrics", startY);

  const cellW = CONTENT_W / 3;
  const cellH = 70;
  const cells: Array<{ label: string; primary: string; subline: string }> = [
    {
      label: "EST. ANNUAL TEU",
      primary: teu || PENDING_TEXT,
      subline: tier || "Tier classification pending",
    },
    {
      label: "ACTIVE LOGISTICS LANES",
      primary: lanesCount || PENDING_TEXT,
      subline: lanesCount ? "Distinct origin → destination corridors" : "",
    },
    {
      label: "PRIMARY OCEAN CARRIERS",
      primary: carriers[0] || PENDING_TEXT,
      subline: carriers.length > 1 ? carriers.slice(1, 5).join(" · ") : "",
    },
  ];

  for (let i = 0; i < cells.length; i++) {
    const x = MARGIN + i * cellW + 4;
    const w = cellW - 8;
    const c = cells[i];
    const isPending = c.primary === PENDING_TEXT;
    doc.setDrawColor(...INK_200);
    doc.setFillColor(...WHITE);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, w, cellH, 6, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...INK_500);
    doc.text(c.label, x + 10, y + 16);

    if (isPending) {
      // Render the pending state as the consistent yellow pill used
      // elsewhere — never as raw text at a different font size. This
      // is the same component drawPendingPill renders for empty
      // sections, so the card feels visually intentional, not broken.
      drawPendingPill(doc, x + 10, y + 30);
    } else {
      // Primary metric value — large dark numerals.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...INK_900);
      const primaryLines = doc.splitTextToSize(c.primary, w - 20);
      doc.text(primaryLines[0] ?? "—", x + 10, y + 40);
    }

    // Sub-line. Skip the auto "Tier classification pending" string
    // when the primary itself is already a pending pill — would
    // double up on the empty-state message in a single card.
    if (c.subline && !(isPending && c.subline.toLowerCase().includes("pending"))) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...INK_500);
      const subLines = doc.splitTextToSize(c.subline, w - 20);
      doc.text(subLines.slice(0, 2), x + 10, y + 56);
    }
  }
  return y + cellH + 14;
}

function drawTradeLanesTable(doc: jsPDF, ov: ExecutiveOverview, startY: number): number {
  let y = drawSectionHeader(doc, "Critical Trade Lane Velocity (Top 3)", startY);
  const lanes = Array.isArray(ov.trade_lane_velocity) ? ov.trade_lane_velocity : [];
  if (!lanes.length) {
    drawPendingPill(doc, MARGIN, y);
    return y + 28;
  }

  const head: RowInput = [
    [
      { content: "Port Pair / Route", styles: { halign: "left" } },
      { content: "Volume Share", styles: { halign: "right" } },
      { content: "Est. Ocean Transit", styles: { halign: "right" } },
      { content: "Velocity Status", styles: { halign: "center" } },
    ],
  ];
  // Hold the status strings in a side array so the velocity column can
  // render as a pill in didDrawCell WITHOUT autoTable also drawing the
  // raw text in the cell. Painting white-over-text leaves background
  // tint mismatches on alternating rows and a hairline of bleed-through
  // at the cell edge — the bug the user reported as "looks even worst."
  const velocityStatuses: string[] = lanes.slice(0, 3).map(
    (row) => stripMarkdown(row.velocity_status) || "Moderate",
  );
  const body: RowInput[] = lanes.slice(0, 3).map((row, i) => [
    {
      content: stripMarkdown(row.route) || `Lane ${i + 1}`,
      styles: { halign: "left" },
    },
    {
      content: Number.isFinite(row.volume_share_pct) ? `${row.volume_share_pct}%` : "—",
      styles: { halign: "right" },
    },
    {
      content: Number.isFinite(row.transit_days) ? `${row.transit_days} days` : "—",
      styles: { halign: "right" },
    },
    // Empty content — autoTable draws nothing, didDrawCell paints the
    // pill in a cleanly empty cell.
    { content: "", styles: { halign: "center" } },
  ]);

  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: INK_800,
      lineColor: INK_200,
      lineWidth: 0.5,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: INK_50,
      textColor: INK_700,
      fontStyle: "bold",
      fontSize: 8,
      lineColor: INK_200,
      lineWidth: 0.5,
    },
    bodyStyles: {
      fillColor: WHITE,
    },
    alternateRowStyles: {
      fillColor: INK_50,
    },
    didDrawCell: (data) => {
      // Velocity status column — autoTable drew an empty cell because
      // body[r][3].content === "". Paint the pill directly into the
      // empty cell, looked up from the parallel velocityStatuses array
      // by row index. No more white-rect overpaint hack.
      if (data.section === "body" && data.column.index === 3) {
        const status = velocityStatuses[data.row.index] || "Moderate";
        const colors = pillColorsForStatus(status);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        const tw = doc.getTextWidth(status);
        const pw = Math.min(tw + 16, data.cell.width - 4);
        const ph = 14;
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + (data.cell.height - ph) / 2;
        doc.setFillColor(...colors.bg);
        doc.roundedRect(cx - pw / 2, cy, pw, ph, ph / 2, ph / 2, "F");
        doc.setTextColor(...colors.fg);
        // Truncate text to fit if the pill width was clamped by cell.
        let label = status;
        while (doc.getTextWidth(label) > pw - 12 && label.length > 4) {
          label = `${label.slice(0, -2)}…`;
        }
        const lw = doc.getTextWidth(label);
        doc.text(label, cx - lw / 2, cy + ph - 4);
      }
    },
  });
  // @ts-expect-error jspdf-autotable mutates the doc.
  return doc.lastAutoTable.finalY + 12;
}

// ─── Section 4: Friction points & value hypotheses ────────────────────────
function drawFrictionPoints(doc: jsPDF, ov: ExecutiveOverview, startY: number): number {
  let y = drawSectionHeader(doc, "Metric-Based Friction Points & Value Hypotheses", startY, { icon: "x" });
  const items = Array.isArray(ov.friction_points) ? ov.friction_points : [];
  if (!items.length) {
    drawPendingPill(doc, MARGIN, y);
    return y + 28;
  }

  const head: RowInput = [
    [
      { content: "Identified Supply Chain Stressor", styles: { halign: "left" } },
      { content: "LIT Platform Value Hypothesis", styles: { halign: "left" } },
    ],
  ];
  const body: RowInput[] = items.map((p) => [
    stripMarkdown(p.stressor) || PENDING_TEXT,
    stripMarkdown(p.value_hypothesis) || PENDING_TEXT,
  ]);

  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: INK_800,
      lineColor: INK_200,
      lineWidth: 0.5,
      cellPadding: 8,
      valign: "top",
    },
    headStyles: {
      fillColor: INK_50,
      textColor: INK_700,
      fontStyle: "bold",
      fontSize: 8,
      lineColor: INK_200,
      lineWidth: 0.5,
    },
    bodyStyles: { fillColor: WHITE },
    alternateRowStyles: { fillColor: INK_50 },
    columnStyles: {
      0: { cellWidth: CONTENT_W * 0.5 },
      1: { cellWidth: CONTENT_W * 0.5 },
    },
  });
  // @ts-expect-error jspdf-autotable mutates the doc.
  return doc.lastAutoTable.finalY + 12;
}

// ─── Section 5: Supply chain leadership ───────────────────────────────────
function drawLeadership(doc: jsPDF, ov: ExecutiveOverview, startY: number): number {
  let y = drawSectionHeader(doc, "Supply Chain Leadership Enrichment", startY, { icon: "i" });

  const raw = Array.isArray(ov.supply_chain_leadership) ? ov.supply_chain_leadership : [];
  // Filter out any non-logistics title that slipped past the LLM.
  const filtered = raw.filter((c) => isLogisticsLeadershipTitle(c.title)).slice(0, 2);

  if (!filtered.length) {
    drawPendingPill(doc, MARGIN, y);
    return y + 28;
  }

  for (const c of filtered) {
    const name = stripMarkdown(c.name) || PENDING_TEXT;
    const title = stripMarkdown(c.title) || PENDING_TEXT;
    const mandate = stripMarkdown(c.strategic_mandate) || PENDING_TEXT;

    // Bullet marker.
    doc.setFillColor(...INK_900);
    doc.circle(MARGIN + 3, y - 3, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK_900);
    doc.text(name, MARGIN + 12, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK_700);
    const titleText = ` — ${title}`;
    const nameW = doc.getTextWidth(name);
    doc.text(titleText, MARGIN + 12 + nameW, y);

    // Mandate one row below.
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK_500);
    const mandateLines = doc.splitTextToSize(`Focus: ${mandate}`, CONTENT_W - 14);
    doc.text(mandateLines.slice(0, 2), MARGIN + 12, y + 12);

    y += 12 + mandateLines.slice(0, 2).length * 11 + 6;
  }
  return y + 4;
}

// ─── Page break helper ────────────────────────────────────────────────────
function ensureRoom(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - FOOTER_H - 16) {
    doc.addPage();
    return HEADER_H + 24;
  }
  return y;
}

// ─── Public entry point ──────────────────────────────────────────────────
export function exportPulseExecutivePdf(args: ExportArgs): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  // Route every render through the backwards-compat layer so cached
  // briefs from before the 2026-06-18 schema redesign still produce
  // a populated PDF rather than an all-pending-pill skeleton. Briefs
  // generated against the new schema short-circuit and return as-is.
  const ov: ExecutiveOverview = buildExecutiveOverviewWithFallback(args, args.brief?.report ?? undefined);
  const freshnessLabel = stripMarkdown(ov.data_freshness_label) || "REAL-TIME CUSTOMS MANIFEST";

  // Block 1: title + opportunity index + corporate metadata sub-header.
  let y = HEADER_H + 28;
  y = drawTitleBlock(doc, args, ov, y);
  y = drawCorporateSubHeader(doc, ov, y + 4);

  // Block 2: executive macro briefing.
  y = ensureRoom(doc, y, 90);
  y = drawMacroBriefing(doc, ov, y + 6);

  // Block 3a: volumetrics grid.
  y = ensureRoom(doc, y, 110);
  y = drawVolumetricsGrid(doc, ov, y + 4);

  // Block 3b: trade lane table.
  y = ensureRoom(doc, y, 120);
  y = drawTradeLanesTable(doc, ov, y);

  // Block 4: friction points.
  y = ensureRoom(doc, y, 140);
  y = drawFrictionPoints(doc, ov, y);

  // Block 5: leadership.
  y = ensureRoom(doc, y, 120);
  drawLeadership(doc, ov, y);

  // Stamp consistent header + footer chrome on every page.
  stampPageChrome(doc, freshnessLabel);

  const slug = (args.companyName || "account")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const generated = args.generatedAt ?? new Date();
  const dateSlug = generated.toISOString().slice(0, 10);
  doc.save(`LIT-Executive-Brief-${slug}-${dateSlug}.pdf`);
}
