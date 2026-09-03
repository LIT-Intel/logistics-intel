/**
 * RFP Proposal PDF — a TRUE executive, client-facing transportation proposal.
 *
 * This is NOT a quote or invoice: it is a high-level, branded presentation of a
 * proposed transportation program. Rates are shown only as *indicative* figures
 * (never firm line items), and no cost/margin data is ever rendered.
 *
 * Generated entirely client-side with jsPDF + jspdf-autotable, reusing the same
 * page geometry, palette, brand chrome, and image helpers as
 * `lib/quoting/exportQuotePdf.ts` so the two LIT documents read as a family.
 * Returns a base64 data URI (`doc.output("datauristring")`) — it does NOT
 * trigger a download.
 */

import jsPDF from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";

import type { QuoteMode, QuoteSettings } from "@/api/quoting";
import type { RfpLane, RfpPayload } from "@/api/rfp";
import { serviceTypeLabel } from "@/api/rfp";
import { getCompanyLogoUrl } from "@/lib/logo";
import { BRAND, PDF_PAGE } from "@/lib/pulse/reportBrand";

// ─── Palette (mirrors exportQuotePdf) ──────────────────────────────────────
const WHITE: [number, number, number] = [255, 255, 255];
const INK_900: [number, number, number] = [15, 23, 42];
const INK_800: [number, number, number] = [30, 41, 59];
const INK_700: [number, number, number] = [51, 65, 85];
const INK_600: [number, number, number] = [71, 85, 105];
const INK_500: [number, number, number] = [100, 116, 139];
const INK_400: [number, number, number] = [148, 163, 184];
const INK_300: [number, number, number] = [203, 213, 225];
const INK_200: [number, number, number] = [226, 232, 240];
const INK_100: [number, number, number] = [241, 245, 249];
const INK_50: [number, number, number] = [248, 250, 252];

const LIT_NAVY: [number, number, number] = [2, 6, 23]; // #020617
const LIT_CYAN: [number, number, number] = [0, 224, 255]; // #00E0FF
const BLUE_700: [number, number, number] = [29, 78, 216];

// ─── Page geometry (Letter portrait) ──────────────────────────────────────
const PAGE_W = PDF_PAGE.width;
const PAGE_H = PDF_PAGE.height;
const MARGIN = PDF_PAGE.marginX;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 56;
const FOOTER_H = 30;

// ─── Public input shape ────────────────────────────────────────────────────
export interface RfpProposalInput {
  rfpNumber?: string | null;
  title: string;
  dueDate?: string | null;
  company: {
    name: string;
    domain?: string | null;
    logo_url?: string | null;
    city?: string | null;
    state?: string | null;
    country_code?: string | null;
    shipments_12m?: number | null;
    teu_12m?: number | null;
    top_route_12m?: string | null;
    most_recent_shipment_date?: string | null;
  };
  payload: RfpPayload;
  /** Org branding (logo_url, company_name, company_address/email/phone, prepared_by, signature_url). */
  settings?: QuoteSettings | null;
  orgName?: string | null;
  orgLogoUrl?: string | null;
  generatedAt?: Date;
}

// ─── Image helpers (copied from exportQuotePdf, never throw) ───────────────
function loadImageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () =>
        resolve(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

/** Map a data-URI mime to a jsPDF image format token. */
function imageFormat(dataUrl: string): "PNG" | "JPEG" {
  return /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
}

interface LogoPlacement {
  dataUrl: string;
  fmt: "PNG" | "JPEG";
  w: number;
  h: number;
}

/** Scale a data-URI logo to ≤maxH/maxW, aspect preserved. Null on any failure. */
async function resolveLogoPlacement(
  dataUrl: string | undefined | null,
  maxH = 32,
  maxW = 150,
): Promise<LogoPlacement | null> {
  if (!dataUrl) return null;
  const size = await loadImageSize(dataUrl);
  if (!size) return null;
  const scale = Math.min(maxH / size.h, maxW / size.w);
  return {
    dataUrl,
    fmt: imageFormat(dataUrl),
    w: Math.max(1, size.w * scale),
    h: Math.max(1, size.h * scale),
  };
}

/**
 * Fetch a remote logo URL and convert it to a data URI so jsPDF can embed it.
 * Resolves to null on ANY failure (network, CORS, decode) — callers silently
 * skip the customer logo when this returns null.
 */
async function urlToDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        const out = String(reader.result ?? "");
        resolve(out.startsWith("data:image") ? out : null);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Formatting helpers (copied from exportQuotePdf) ───────────────────────
function usd(value: unknown, currency = "USD"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString()}`;
  }
}

function clean(text: unknown): string {
  if (text == null) return "";
  return String(text).replace(/\s+/g, " ").trim();
}

function fmtDate(value: unknown): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return clean(value) || "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function modeLabel(mode?: QuoteMode | string | null): string {
  switch (mode) {
    case "ocean":
      return "Ocean Freight";
    case "air":
      return "Air Freight";
    case "drayage":
      return "Drayage";
    case "ftl":
      return "Full Truckload";
    case "ltl":
      return "Less-than-Truckload";
    default:
      return clean(mode) || "Freight";
  }
}

function modeShort(mode?: QuoteMode | string | null): string {
  switch (mode) {
    case "ocean":
      return "OCEAN";
    case "air":
      return "AIR";
    case "drayage":
      return "DRAY";
    case "ftl":
      return "FTL";
    case "ltl":
      return "LTL";
    default:
      return (clean(mode) || "MODE").toUpperCase();
  }
}

function locationLabel(city?: string | null, state?: string | null, country?: string | null): string {
  const parts = [clean(city), clean(state), clean(country)].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

// ─── Brand mark (navy tile + cyan initial) ─────────────────────────────────
function drawBrandMark(doc: jsPDF, x: number, y: number, size: number): void {
  doc.setFillColor(...LIT_NAVY);
  doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size * 0.62);
  doc.setTextColor(...LIT_CYAN);
  const mark = BRAND.mark || "L";
  const mw = doc.getTextWidth(mark);
  doc.text(mark, x + (size - mw) / 2, y + size * 0.72);
}

// ─── Page chrome (header logo + navy footer with page N of M) ──────────────
function drawHeaderBar(doc: jsPDF, orgName: string, logo: LogoPlacement | null): void {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  doc.setDrawColor(...INK_200);
  doc.setLineWidth(0.5);
  doc.line(0, HEADER_H, PAGE_W, HEADER_H);

  if (logo) {
    const y = (HEADER_H - logo.h) / 2;
    try {
      doc.addImage(logo.dataUrl, logo.fmt, MARGIN, y, logo.w, logo.h);
    } catch {
      drawBrandMark(doc, MARGIN, 14, 28);
    }
    const textX = MARGIN + logo.w + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK_900);
    doc.text(orgName, textX, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK_500);
    doc.text("TRANSPORTATION PROPOSAL", textX, 39);
    return;
  }

  drawBrandMark(doc, MARGIN, 14, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK_900);
  doc.text(orgName, MARGIN + 36, 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK_500);
  doc.text("TRANSPORTATION PROPOSAL", MARGIN + 36, 39);
}

function drawFooter(doc: jsPDF, pageNum: number, pageCount: number): void {
  const barH = 16;
  const barY = PAGE_H - barH;
  doc.setFillColor(...LIT_NAVY);
  doc.rect(0, barY, PAGE_W, barH, "F");
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(0.8);
  doc.line(0, barY - 0.4, PAGE_W, barY - 0.4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`${BRAND.wordmark} · ${BRAND.footerCity}`, MARGIN, barY + 11);
  const right = `Page ${pageNum} of ${pageCount}`;
  const rw = doc.getTextWidth(right);
  doc.setTextColor(...LIT_CYAN);
  doc.text(right, PAGE_W - MARGIN - rw, barY + 11);
}

function stampPageChrome(doc: jsPDF, orgName: string, logo: LogoPlacement | null): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawHeaderBar(doc, orgName, logo);
    drawFooter(doc, i, total);
  }
}

// ─── Section header (cyan accent rule) ─────────────────────────────────────
function drawSectionHeader(doc: jsPDF, label: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK_900);
  const labelText = label.toUpperCase();
  doc.text(labelText, MARGIN, y);
  const labelW = doc.getTextWidth(labelText);
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(1.4);
  doc.line(MARGIN, y + 3, MARGIN + labelW + 12, y + 3);
  doc.setDrawColor(...INK_200);
  doc.setLineWidth(0.4);
  doc.line(MARGIN + labelW + 16, y + 3, PAGE_W - MARGIN, y + 3);
  return y + 20;
}

function ensureRoom(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - FOOTER_H - 16) {
    doc.addPage();
    return HEADER_H + 28;
  }
  return y;
}

// ─── Mode glyph — simple vector shape per mode, inside a navy chip ─────────
/**
 * Draw a colored rounded chip with a small vector glyph + the short mode label.
 * Glyphs are intentionally minimal (hulls, triangles, boxes) so they read at
 * small sizes and never depend on external assets.
 */
function drawModeChip(doc: jsPDF, x: number, y: number, mode?: QuoteMode | string | null): number {
  const chipW = 62;
  const chipH = 38;
  doc.setFillColor(...LIT_NAVY);
  doc.roundedRect(x, y, chipW, chipH, 6, 6, "F");

  // Glyph zone (top), label zone (bottom).
  const gx = x + chipW / 2;
  const gy = y + 13;
  doc.setDrawColor(...LIT_CYAN);
  doc.setFillColor(...LIT_CYAN);
  doc.setLineWidth(1.1);

  switch (mode) {
    case "ocean": {
      // Simple ship hull (trapezoid) + a mast line.
      doc.lines([[16, 0], [-4, 7], [-8, 0], [-4, -7]], gx - 8, gy, [1, 1], "F", true);
      doc.line(gx, gy - 8, gx, gy - 1);
      break;
    }
    case "air": {
      // Plane as a forward-pointing triangle.
      doc.triangle(gx - 8, gy + 4, gx - 8, gy - 4, gx + 9, gy, "F");
      break;
    }
    case "drayage": {
      // Container box with a vertical divider.
      doc.roundedRect(gx - 10, gy - 5, 20, 10, 1, 1, "S");
      doc.line(gx, gy - 5, gx, gy + 5);
      break;
    }
    case "ftl": {
      // Truck: cab + trailer box.
      doc.roundedRect(gx - 11, gy - 4, 12, 8, 1, 1, "S");
      doc.roundedRect(gx + 2, gy - 2, 8, 6, 1, 1, "F");
      break;
    }
    case "ltl": {
      // Stacked boxes.
      doc.roundedRect(gx - 9, gy - 1, 8, 6, 1, 1, "S");
      doc.roundedRect(gx + 1, gy - 1, 8, 6, 1, 1, "S");
      doc.roundedRect(gx - 4, gy - 8, 8, 6, 1, 1, "F");
      break;
    }
    default: {
      // Generic dot cluster.
      doc.circle(gx, gy, 3, "F");
      break;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...LIT_CYAN);
  const label = modeShort(mode);
  const lw = doc.getTextWidth(label);
  doc.text(label, gx - lw / 2, y + chipH - 8);
  return chipW;
}

// ─── Small chip row (distinct modes / labels) ──────────────────────────────
function drawChipRow(doc: jsPDF, labels: string[], startY: number): number {
  let x = MARGIN;
  let y = startY;
  const padX = 8;
  const chipH = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  for (const raw of labels) {
    const label = clean(raw);
    if (!label) continue;
    const w = doc.getTextWidth(label) + padX * 2;
    if (x + w > PAGE_W - MARGIN) {
      x = MARGIN;
      y += chipH + 6;
    }
    doc.setFillColor(...INK_100);
    doc.roundedRect(x, y - 11, w, chipH, 8, 8, "F");
    doc.setTextColor(...INK_700);
    doc.text(label, x + padX, y);
    x += w + 8;
  }
  return y + chipH;
}

// ─── Cover / title band ────────────────────────────────────────────────────
function drawCoverBand(
  doc: jsPDF,
  input: RfpProposalInput,
  orgLogo: LogoPlacement | null,
  orgName: string,
  generated: Date,
  startY: number,
): number {
  let y = startY;

  // Left: org logo (or brand mark) + document-type label on a navy/cyan accent.
  const labelPillW = 176;
  const labelPillH = 18;
  doc.setFillColor(...LIT_NAVY);
  doc.roundedRect(MARGIN, y, labelPillW, labelPillH, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LIT_CYAN);
  doc.text("TRANSPORTATION PROPOSAL", MARGIN + 10, y + 12.5);

  // Meta card top-right: RFP #, Date, Proposal Due.
  const meta: Array<[string, string]> = [
    ["RFP #", clean(input.rfpNumber) || "—"],
    ["DATE", fmtDate(generated)],
    ["PROPOSAL DUE", input.dueDate ? fmtDate(input.dueDate) : "—"],
  ];
  const cardW = 200;
  const cardX = PAGE_W - MARGIN - cardW;
  let metaY = y + 2;
  for (const [label, value] of meta) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...INK_500);
    doc.text(label, cardX, metaY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK_800);
    const vw = doc.getTextWidth(value);
    doc.text(value, PAGE_W - MARGIN - vw, metaY);
    metaY += 16;
  }

  // Big title.
  y += labelPillH + 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...INK_900);
  const titleLines = doc.splitTextToSize(clean(input.title) || "Transportation Proposal", CONTENT_W);
  for (const line of titleLines.slice(0, 3)) {
    doc.text(line, MARGIN, y);
    y += 26;
  }

  // Cyan underline rule under the title.
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(2);
  doc.line(MARGIN, y - 12, MARGIN + 120, y - 12);

  // orgLogo/orgName are stamped by page chrome on every page; keep unused
  // params referenced for clarity of intent.
  void orgLogo;
  void orgName;

  return Math.max(y, metaY) + 4;
}

// ─── Prepared For / Prepared By two-column block ───────────────────────────
function drawPreparedBlocks(
  doc: jsPDF,
  input: RfpProposalInput,
  branding: QuoteSettings,
  customerLogo: LogoPlacement | null,
  startY: number,
): number {
  const colGap = 20;
  const colW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;

  // Header accents for each column.
  const headerY = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...INK_500);
  doc.text("PREPARED FOR", leftX, headerY);
  doc.text("PREPARED BY", rightX, headerY);
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(1.2);
  doc.line(leftX, headerY + 3, leftX + doc.getTextWidth("PREPARED FOR") + 10, headerY + 3);
  doc.line(rightX, headerY + 3, rightX + doc.getTextWidth("PREPARED BY") + 10, headerY + 3);

  // ── Left: customer ──
  let ly = headerY + 20;
  if (customerLogo) {
    try {
      doc.addImage(customerLogo.dataUrl, customerLogo.fmt, leftX, ly - 12, customerLogo.w, customerLogo.h);
      ly += customerLogo.h + 2;
    } catch {
      // skip on any failure
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK_900);
  for (const line of doc.splitTextToSize(clean(input.company.name) || "Customer", colW)) {
    doc.text(line, leftX, ly);
    ly += 15;
  }
  const loc = locationLabel(input.company.city, input.company.state, input.company.country_code);
  if (loc) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK_600);
    for (const line of doc.splitTextToSize(loc, colW)) {
      doc.text(line, leftX, ly);
      ly += 13;
    }
  }
  const contactName = clean(input.payload.summary.contact_name);
  const contactEmail = clean(input.payload.summary.contact_email);
  if (contactName || contactEmail) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK_500);
    if (contactName) {
      doc.text(`Attn: ${contactName}`, leftX, ly);
      ly += 12;
    }
    if (contactEmail) {
      doc.text(contactEmail, leftX, ly);
      ly += 12;
    }
  }

  // ── Right: org ──
  let ry = headerY + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK_900);
  const orgCompany = clean(branding.company_name) || clean(input.orgName) || BRAND.wordmark;
  for (const line of doc.splitTextToSize(orgCompany, colW)) {
    doc.text(line, rightX, ry);
    ry += 15;
  }
  const orgLines = [
    clean(branding.company_address),
    clean(branding.company_email),
    clean(branding.company_phone),
    clean(branding.prepared_by) ? `Prepared by ${clean(branding.prepared_by)}` : "",
  ].filter(Boolean);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK_600);
  for (const block of orgLines) {
    for (const line of doc.splitTextToSize(block, colW)) {
      doc.text(line, rightX, ry);
      ry += 13;
    }
  }

  return Math.max(ly, ry) + 10;
}

// ─── Free-text section (Executive Summary / Service Scope) ─────────────────
function drawParagraphSection(doc: jsPDF, label: string, body: string, startY: number): number {
  const text = clean(body);
  if (!text) return startY;
  let y = ensureRoom(doc, startY, 60);
  y = drawSectionHeader(doc, label, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK_700);
  for (const line of doc.splitTextToSize(text, CONTENT_W)) {
    y = ensureRoom(doc, y, 16);
    doc.text(line, MARGIN, y);
    y += 13;
  }
  return y + 8;
}

// ─── Lanes of service — presentation cards, one per lane ───────────────────
function drawLane(doc: jsPDF, lane: RfpLane, currency: string, startY: number): number {
  const cardH = 96;
  let y = ensureRoom(doc, startY, cardH + 8);

  // Card background.
  doc.setFillColor(...INK_50);
  doc.setDrawColor(...INK_200);
  doc.setLineWidth(0.6);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 6, 6, "FD");

  const pad = 12;
  const chipX = MARGIN + pad;
  const chipY = y + pad;
  const chipW = drawModeChip(doc, chipX, chipY, lane.mode);

  const textX = chipX + chipW + 16;
  const textW = CONTENT_W - (textX - MARGIN) - pad - 130; // reserve right column for rate

  // Origin -> Destination (bold).
  let ty = y + pad + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK_900);
  const route = `${clean(lane.origin) || "Origin"}  →  ${clean(lane.destination) || "Destination"}`;
  for (const line of doc.splitTextToSize(route, textW).slice(0, 2)) {
    doc.text(line, textX, ty);
    ty += 15;
  }

  // Metadata line(s).
  const meta: string[] = [];
  meta.push(`Service: ${serviceTypeLabel(lane.service_type)}`);
  if (clean(lane.equipment)) {
    const isBox = lane.mode === "ocean" || lane.mode === "drayage";
    meta.push(`${isBox ? "Container" : "Equipment"}: ${clean(lane.equipment)}`);
  }
  const vol = Number(lane.annual_volume);
  if (Number.isFinite(vol) && vol > 0) {
    const freq = clean(lane.frequency);
    meta.push(`Volume: ${fmtNumber(vol)}/yr${freq ? ` (${freq})` : ""}`);
  }
  if (Number(lane.transit_days) > 0) meta.push(`Transit: ${fmtNumber(lane.transit_days)} days`);
  if (clean(lane.commodity)) meta.push(`Commodity: ${clean(lane.commodity)}`);
  if (clean(lane.incoterm)) meta.push(`Incoterm: ${clean(lane.incoterm)}`);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK_600);
  const metaText = meta.join("   ·   ");
  for (const line of doc.splitTextToSize(metaText, textW).slice(0, 3)) {
    doc.text(line, textX, ty);
    ty += 11.5;
  }

  // Right column: INDICATIVE rate.
  const rate = Number(lane.target_rate) || Number(lane.sell_rate);
  const rateBoxW = 118;
  const rateBoxX = MARGIN + CONTENT_W - pad - rateBoxW;
  const rateBoxY = y + pad;
  if (Number.isFinite(rate) && rate > 0) {
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...INK_200);
    doc.setLineWidth(0.5);
    doc.roundedRect(rateBoxX, rateBoxY, rateBoxW, cardH - pad * 2, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...INK_500);
    doc.text("INDICATIVE", rateBoxX + 10, rateBoxY + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...BLUE_700);
    doc.text(usd(rate, currency), rateBoxX + 10, rateBoxY + 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...INK_500);
    const unit = clean(lane.equipment) || "unit";
    doc.text(`per ${unit}`, rateBoxX + 10, rateBoxY + 48);
  }

  return y + cardH + 10;
}

function drawLanes(doc: jsPDF, lanes: RfpLane[], currency: string, startY: number): number {
  let y = ensureRoom(doc, startY, 60);
  y = drawSectionHeader(doc, "Lanes of Service", y);
  if (!lanes.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK_500);
    doc.text("No lanes specified.", MARGIN, y);
    return y + 16;
  }
  for (const lane of lanes) {
    y = drawLane(doc, lane, currency, y);
  }
  // Honest note that rates are indicative, not firm.
  y = ensureRoom(doc, y, 24);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...INK_500);
  doc.text(
    "Indicative rates are directional and subject to a firm quotation upon award; not a binding offer.",
    MARGIN,
    y,
  );
  return y + 12;
}

// ─── LIT Shipment Intelligence panel (the differentiator) ──────────────────
function drawIntelligencePanel(doc: jsPDF, company: RfpProposalInput["company"], startY: number): number {
  const items: Array<[string, string]> = [];
  if (company.shipments_12m != null) items.push(["Shipments (12M)", fmtNumber(company.shipments_12m)]);
  if (company.teu_12m != null) items.push(["Est. TEU (12M)", fmtNumber(company.teu_12m)]);
  if (clean(company.top_route_12m)) items.push(["Top Trade Lane", clean(company.top_route_12m)]);
  if (company.most_recent_shipment_date != null && clean(company.most_recent_shipment_date))
    items.push(["Most Recent Activity", fmtDate(company.most_recent_shipment_date)]);

  if (!items.length) return startY;

  const panelH = 92;
  let y = ensureRoom(doc, startY, panelH + 20);
  y = drawSectionHeader(doc, "LIT Shipment Intelligence", y);

  // Navy panel with cyan accent — visually distinct from the rest.
  doc.setFillColor(...LIT_NAVY);
  doc.roundedRect(MARGIN, y, CONTENT_W, panelH, 6, 6, "F");
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(2);
  doc.line(MARGIN, y, MARGIN, y + panelH);

  const cols = Math.min(items.length, 4);
  const cellW = (CONTENT_W - 24) / cols;
  const baseX = MARGIN + 16;
  const statY = y + 26;
  for (let i = 0; i < items.length; i++) {
    const [label, value] = items[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = baseX + col * cellW;
    const cy = statY + row * 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...LIT_CYAN);
    doc.text(value, cx, cy, { maxWidth: cellW - 8 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(label.toUpperCase(), cx, cy + 12, { maxWidth: cellW - 8 });
  }

  // Honest provenance line.
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Sourced from observed shipment records; indicative of opportunity scale.",
    MARGIN + 16,
    y + panelH - 10,
  );

  return y + panelH + 14;
}

// ─── Commercial overview (high-level, NOT line items) ──────────────────────
function drawCommercialOverview(doc: jsPDF, lanes: RfpLane[], currency: string, startY: number): number {
  let y = ensureRoom(doc, startY, 90);
  y = drawSectionHeader(doc, "Commercial Overview", y);

  let annualValue = 0;
  let totalVolume = 0;
  for (const lane of lanes) {
    const rate = Number(lane.target_rate) || Number(lane.sell_rate) || 0;
    const vol = Number(lane.annual_volume) || 0;
    if (Number.isFinite(rate) && Number.isFinite(vol)) annualValue += rate * vol;
    if (Number.isFinite(vol)) totalVolume += vol;
  }

  const stats: Array<[string, string]> = [
    ["Estimated Annual Value", usd(annualValue, currency)],
    ["Lanes", fmtNumber(lanes.length)],
    ["Total Annual Volume", fmtNumber(totalVolume)],
  ];

  const cols = stats.length;
  const gap = 16;
  const boxW = (CONTENT_W - gap * (cols - 1)) / cols;
  const boxH = 56;
  for (let i = 0; i < stats.length; i++) {
    const [label, value] = stats[i];
    const bx = MARGIN + i * (boxW + gap);
    doc.setFillColor(...INK_50);
    doc.setDrawColor(...INK_200);
    doc.setLineWidth(0.6);
    doc.roundedRect(bx, y, boxW, boxH, 6, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(i === 0 ? 17 : 15);
    doc.setTextColor(i === 0 ? BLUE_700[0] : INK_900[0], i === 0 ? BLUE_700[1] : INK_900[1], i === 0 ? BLUE_700[2] : INK_900[2]);
    doc.text(value, bx + 12, y + 30, { maxWidth: boxW - 20 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...INK_500);
    doc.text(label.toUpperCase(), bx + 12, y + 44, { maxWidth: boxW - 20 });
  }

  y += boxH + 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...INK_500);
  doc.text(
    "Estimated annual value is directional, derived from indicative rates and stated volumes.",
    MARGIN,
    y,
  );
  return y + 12;
}

// ─── Public entry point ────────────────────────────────────────────────────
/**
 * Render a branded executive RFP proposal and return it as a base64 data URI
 * (`data:application/pdf;base64,...`). Does NOT trigger a download.
 */
export async function exportRfpProposal(input: RfpProposalInput): Promise<string> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  const branding: QuoteSettings = input.settings ?? {};
  const orgName = clean(branding.company_name) || clean(input.orgName) || BRAND.wordmark;
  const generated = input.generatedAt ?? new Date();
  const currency = clean(input.payload.summary.currency) || "USD";

  // Resolve the customer logo URL: explicit logo_url wins, else logo.dev by domain.
  const customerLogoSrc =
    clean(input.company.logo_url) || getCompanyLogoUrl(input.company.domain) || null;

  // Pre-load all images up-front (async) so the synchronous draw passes and the
  // per-page chrome stamp can place them. Any failure resolves to null.
  const [orgLogo, customerLogoDataUri] = await Promise.all([
    resolveLogoPlacement(clean(branding.logo_url) || clean(input.orgLogoUrl) || null, 32, 150),
    urlToDataUri(customerLogoSrc),
  ]);
  const customerLogo = await resolveLogoPlacement(customerLogoDataUri, 34, 150);

  let y = HEADER_H + 30;
  y = drawCoverBand(doc, input, orgLogo, orgName, generated, y);
  y = drawPreparedBlocks(doc, input, branding, customerLogo, y + 12);

  y = drawParagraphSection(doc, "Executive Summary", input.payload.summary.description, y + 2);

  // Service scope + a chip row of the distinct modes across lanes.
  const scope = clean(input.payload.summary.service_requirements);
  const distinctModes = Array.from(new Set(input.payload.lanes.map((l) => modeLabel(l.mode)).filter(Boolean)));
  if (scope || distinctModes.length) {
    y = ensureRoom(doc, y, 60);
    y = drawSectionHeader(doc, "Service Scope & Requirements", y);
    if (scope) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK_700);
      for (const line of doc.splitTextToSize(scope, CONTENT_W)) {
        y = ensureRoom(doc, y, 16);
        doc.text(line, MARGIN, y);
        y += 13;
      }
      y += 4;
    }
    if (distinctModes.length) {
      y = ensureRoom(doc, y, 30);
      y = drawChipRow(doc, distinctModes, y + 4) + 8;
    }
  }

  y = drawLanes(doc, input.payload.lanes, currency, y + 4);
  y = drawIntelligencePanel(doc, input.company, y + 4);
  y = drawCommercialOverview(doc, input.payload.lanes, currency, y + 4);

  stampPageChrome(doc, orgName, orgLogo);

  return doc.output("datauristring");
}
