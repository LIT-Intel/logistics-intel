/**
 * Quote PDF — branded, customer-facing freight quote.
 *
 * Generated entirely client-side with jsPDF + jspdf-autotable, modeled on
 * `lib/pulse/exportPulseExecutivePdf.ts` (page geometry, brand mark, section
 * headers, autoTable styling). Unlike the Pulse brief, this returns a base64
 * data URI (`doc.output("datauristring")`) so the caller can hand it to the
 * `quote-generate-pdf` edge function rather than triggering a local download.
 *
 * Data honesty for a customer document: only sell-side numbers are printed.
 * Cost and margin are internal and are NEVER rendered here.
 */

import jsPDF from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";

import type { Quote, QuoteLineItem, QuoteMode, QuoteSettings } from "@/api/quoting";
import { USES_PORTS } from "@/lib/quoting/modeFields";
import { BRAND, PDF_PAGE } from "@/lib/pulse/reportBrand";

// ─── Palette (Studio White, mirrors the Pulse brief) ──────────────────────
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

// ─── Org-overridable branding ─────────────────────────────────────────────
export interface QuoteOrgDefaults {
  company_name?: string | null;
  logo_text?: string | null;
  prepared_by?: string | null;
  signature_name?: string | null;
  payment_terms?: string | null;
  /** Falls back to the quote's terms_text, then a sane default. */
  terms_text?: string | null;
}

export interface ExportQuotePdfOptions {
  orgDefaults?: QuoteOrgDefaults | null;
  /** Full org quote settings (branding + defaults). Supersedes `orgDefaults`. */
  settings?: QuoteSettings | null;
  /** Optional human-readable company name for the customer block. */
  companyName?: string | null;
  /** Optional contact name for the customer block. */
  contactName?: string | null;
  generatedAt?: Date;
}

/**
 * Merge the full `settings` object (new path) with the legacy `orgDefaults`
 * shape so the rest of the renderer reads one normalized object. `settings`
 * wins; `orgDefaults` fields are a fallback for older callers.
 */
function resolveBranding(opts: ExportQuotePdfOptions): QuoteSettings {
  const s = opts.settings ?? {};
  const d = opts.orgDefaults ?? {};
  return {
    company_name: s.company_name ?? d.company_name ?? undefined,
    company_address: s.company_address ?? undefined,
    company_email: s.company_email ?? undefined,
    company_phone: s.company_phone ?? undefined,
    logo_url: s.logo_url ?? undefined,
    signature_url: s.signature_url ?? undefined,
    signature_name: s.signature_name ?? d.signature_name ?? undefined,
    prepared_by: s.prepared_by ?? d.prepared_by ?? undefined,
    default_payment_terms: s.default_payment_terms ?? d.payment_terms ?? undefined,
    terms_text: s.terms_text ?? d.terms_text ?? undefined,
  };
}

/**
 * Load a (data-URI) image and resolve its natural pixel dimensions so the PDF
 * can preserve aspect ratio when placing it. Resolves to null on any failure
 * so callers can fall back to the text brand mark — never throws.
 */
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

// ─── Formatting helpers ────────────────────────────────────────────────────
function usd(value: unknown, currency = "USD"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
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

function modeLabel(mode?: QuoteMode | null): string {
  switch (mode) {
    case "ocean":
      return "Ocean Freight";
    case "air":
      return "Air Freight";
    case "drayage":
      return "Drayage";
    case "ftl":
      return "Full Truckload (FTL)";
    case "ltl":
      return "Less-than-Truckload (LTL)";
    default:
      return clean(mode) || "Freight";
  }
}

/** City/state/country join for non-port modes. Guards missing fields. */
function locationLabel(city?: string | null, state?: string | null, country?: string | null): string {
  const parts = [clean(city), clean(state), clean(country)].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

// ─── Brand mark ────────────────────────────────────────────────────────────
// Navy rounded tile + cyan wordmark initial, matching the Pulse brief's
// brand cue (cyan on navy) so the two LIT documents read as a family.
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

// ─── Page chrome ───────────────────────────────────────────────────────────
/** Pre-resolved logo placement so the per-page chrome stamp stays synchronous. */
interface LogoPlacement {
  dataUrl: string;
  fmt: "PNG" | "JPEG";
  w: number;
  h: number;
}

/**
 * Compute a logo placement (scaled to ≤`maxH` header height, aspect preserved)
 * from a data-URI. Returns null when the image can't be sized — caller falls
 * back to the text brand mark.
 */
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

function drawHeaderBar(doc: jsPDF, orgName: string, logo: LogoPlacement | null): void {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  doc.setDrawColor(...INK_200);
  doc.setLineWidth(0.5);
  doc.line(0, HEADER_H, PAGE_W, HEADER_H);

  if (logo) {
    // Vertically center the logo within the header band; name sits to its right.
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
    doc.text("FREIGHT QUOTATION", textX, 39);
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
  doc.text("FREIGHT QUOTATION", MARGIN + 36, 39);
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

// ─── Section header (cyan accent rule, mirrors the Pulse brief) ────────────
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

// ─── Title block — quote number, dates ─────────────────────────────────────
function drawTitleBlock(
  doc: jsPDF,
  quote: Quote,
  opts: ExportQuotePdfOptions,
  branding: QuoteSettings,
  startY: number,
): number {
  let y = startY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK_900);
  doc.text("QUOTATION", MARGIN, y);
  y += 6;

  // Issuing-company block under the title (name + contact lines). Each field
  // is optional and guarded; nothing renders when all are empty.
  const companyName = clean(branding.company_name);
  const contactLines = [
    clean(branding.company_address),
    [clean(branding.company_email), clean(branding.company_phone)].filter(Boolean).join("  ·  "),
  ].filter(Boolean);

  if (companyName) {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK_800);
    doc.text(companyName, MARGIN, y);
  }
  if (contactLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK_500);
    for (const block of contactLines) {
      for (const line of doc.splitTextToSize(block, CONTENT_W * 0.55)) {
        y += 12;
        doc.text(line, MARGIN, y);
      }
    }
  }

  // Meta card top-right: quote #, date, valid-until.
  const generated = opts.generatedAt ?? (quote.created_at ? new Date(quote.created_at) : new Date());
  const meta: Array<[string, string]> = [
    ["QUOTE #", clean(quote.quote_number) || "—"],
    ["DATE", fmtDate(generated)],
    ["VALID UNTIL", quote.valid_until ? fmtDate(quote.valid_until) : "—"],
  ];
  const cardW = 200;
  const cardX = PAGE_W - MARGIN - cardW;
  let metaY = startY - 14;
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

  return Math.max(y + 10, metaY) + 6;
}

// ─── Customer + lane blocks (two columns) ─────────────────────────────────
function drawCustomerAndLane(
  doc: jsPDF,
  quote: Quote,
  opts: ExportQuotePdfOptions,
  startY: number,
): number {
  const colGap = 20;
  const colW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;

  // ── Left: customer block ──
  let ly = drawSectionHeader(doc, "Prepared For", startY);
  // drawSectionHeader spans full width; redraw a short accent over left col only.
  const companyName = clean(opts.companyName) || "Customer";
  const contactName = clean(opts.contactName);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK_900);
  for (const line of doc.splitTextToSize(companyName, colW)) {
    doc.text(line, leftX, ly);
    ly += 14;
  }
  if (contactName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK_600);
    doc.text(`Attn: ${contactName}`, leftX, ly);
    ly += 13;
  }
  if (quote.incoterms) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK_500);
    doc.text(`Incoterms: ${clean(quote.incoterms)}`, leftX, ly);
    ly += 13;
  }

  // ── Right: lane block ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK_900);
  doc.text("SHIPMENT", rightX, startY);
  const accentW = doc.getTextWidth("SHIPMENT");
  doc.setDrawColor(...LIT_CYAN);
  doc.setLineWidth(1.4);
  doc.line(rightX, startY + 3, rightX + accentW + 12, startY + 3);

  let ry = startY + 20;
  const mode = (quote.mode ?? undefined) as QuoteMode | undefined;
  const usesPorts = mode ? USES_PORTS[mode] : false;

  const origin = usesPorts
    ? clean(quote.origin_port) || "—"
    : locationLabel(quote.origin_city, quote.origin_state, quote.origin_country);
  const dest = usesPorts
    ? clean(quote.destination_port) || "—"
    : locationLabel(quote.destination_city, quote.destination_state, quote.destination_country);

  const laneRows: Array<[string, string]> = [
    ["Mode", modeLabel(mode)],
    ["Service", clean(quote.service_type) || "—"],
    ["Origin", origin],
    ["Destination", dest],
  ];
  if (quote.equipment_type) laneRows.push(["Equipment", clean(quote.equipment_type)]);
  if (quote.commodity) laneRows.push(["Commodity", clean(quote.commodity)]);

  for (const [label, value] of laneRows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...INK_500);
    doc.text(label.toUpperCase(), rightX, ry);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK_800);
    const valueLines = doc.splitTextToSize(value, colW - 84);
    doc.text(valueLines.length ? valueLines.slice(0, 2) : ["—"], rightX + 74, ry);
    ry += Math.max(1, Math.min(2, valueLines.length)) * 12 + 2;
  }

  return Math.max(ly, ry) + 8;
}

// ─── Line items + accessorials table (sell-side only) ──────────────────────
function drawLineItems(doc: jsPDF, quote: Quote, lineItems: QuoteLineItem[], startY: number): number {
  let y = drawSectionHeader(doc, "Charges", startY);
  const currency = quote.currency || "USD";

  const items = Array.isArray(lineItems) ? lineItems : [];
  const ordered = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const head: RowInput = [
    [
      { content: "Charge", styles: { halign: "left" } },
      { content: "Qty", styles: { halign: "right" } },
      { content: "Unit", styles: { halign: "right" } },
      { content: "Total", styles: { halign: "right" } },
    ],
  ];

  const body: RowInput[] = ordered.length
    ? ordered.map((li) => {
        const qty = Number.isFinite(li.quantity) ? Number(li.quantity) : 1;
        const unitSell = Number.isFinite(li.unit_sell) ? Number(li.unit_sell) : 0;
        const total = qty * unitSell;
        const name = clean(li.name) || "Charge";
        const desc = clean(li.description);
        const acc = li.is_accessorial ? " · Accessorial" : "";
        return [
          { content: desc ? `${name}${acc}\n${desc}` : `${name}${acc}`, styles: { halign: "left" } },
          { content: qty.toLocaleString(), styles: { halign: "right" } },
          { content: usd(unitSell, currency), styles: { halign: "right" } },
          { content: usd(total, currency), styles: { halign: "right" } },
        ];
      })
    : [[{ content: "No charges added.", colSpan: 4, styles: { halign: "left", textColor: INK_500 } }]];

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
      valign: "middle",
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
      0: { cellWidth: CONTENT_W - 270 },
      1: { cellWidth: 60, halign: "right" },
      2: { cellWidth: 100, halign: "right" },
      3: { cellWidth: 110, halign: "right" },
    },
  });
  // @ts-expect-error jspdf-autotable mutates the doc.
  return doc.lastAutoTable.finalY + 12;
}

// ─── Totals block (sell-side only — NO cost / margin) ─────────────────────
function drawTotals(doc: jsPDF, quote: Quote, startY: number): number {
  const currency = quote.currency || "USD";
  const boxW = 250;
  const x = PAGE_W - MARGIN - boxW;
  let y = startY;

  const rows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: "Subtotal", value: usd(quote.subtotal_sell, currency) },
  ];
  if (Number(quote.fuel_surcharge_amount) > 0) {
    const pct = Number.isFinite(quote.fuel_surcharge_pct) ? ` (${quote.fuel_surcharge_pct}%)` : "";
    rows.push({ label: `Fuel surcharge${pct}`, value: usd(quote.fuel_surcharge_amount, currency) });
  }
  if (Number(quote.accessorial_total) > 0) {
    rows.push({ label: "Accessorials", value: usd(quote.accessorial_total, currency) });
  }

  for (const r of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK_600);
    doc.text(r.label, x, y);
    const vw = doc.getTextWidth(r.value);
    doc.setTextColor(...INK_800);
    doc.text(r.value, x + boxW - vw, y);
    y += 16;
  }

  // Total Sell — emphasized.
  y += 2;
  doc.setDrawColor(...INK_200);
  doc.setLineWidth(0.6);
  doc.line(x, y - 6, x + boxW, y - 6);

  doc.setFillColor(...INK_50);
  doc.roundedRect(x, y - 2, boxW, 26, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK_900);
  doc.text("TOTAL", x + 10, y + 15);
  const total = usd(quote.total_sell, currency);
  doc.setTextColor(...BLUE_700);
  doc.setFontSize(13);
  const tw = doc.getTextWidth(total);
  doc.text(total, x + boxW - 10 - tw, y + 15);

  return y + 34;
}

// ─── Footer: terms + prepared-by + signature ───────────────────────────────
function drawTermsAndSignature(
  doc: jsPDF,
  quote: Quote,
  branding: QuoteSettings,
  signature: LogoPlacement | null,
  startY: number,
): number {
  let y = drawSectionHeader(doc, "Terms & Conditions", startY);

  // Payment terms: org default first, then quote-specific override fallback.
  const paymentTerms =
    clean(branding.default_payment_terms) || "Payment due Net 30 from invoice date.";
  // Terms text: the quote's own terms win (per-quote override), then the org
  // default, then a sane boilerplate.
  const termsText =
    clean(quote.terms_text) ||
    clean(branding.terms_text) ||
    "Rates exclude duties & taxes. Subject to space & equipment availability. This quotation is valid until the date noted above.";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...INK_700);
  doc.text("PAYMENT TERMS", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK_700);
  for (const line of doc.splitTextToSize(paymentTerms, CONTENT_W)) {
    y += 12;
    doc.text(line, MARGIN, y);
  }
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK_500);
  for (const line of doc.splitTextToSize(termsText, CONTENT_W)) {
    y = ensureRoom(doc, y, 16);
    doc.text(line, MARGIN, y);
    y += 12;
  }

  // Prepared by + signature line.
  y = ensureRoom(doc, y, signature ? 90 : 60);
  y += 14;
  const preparedBy = clean(branding.prepared_by) || clean(branding.signature_name);
  const signatureName = clean(branding.signature_name);
  const orgName = clean(branding.company_name) || BRAND.wordmark;

  // Draw the signature image (if any) sitting on the prepared-by line.
  if (signature) {
    try {
      const sigY = y + 18 - signature.h; // baseline-aligned to the rule below
      doc.addImage(signature.dataUrl, signature.fmt, MARGIN, Math.max(y, sigY), signature.w, signature.h);
    } catch {
      // Drawing failed — silently skip the image; the text block still renders.
    }
  }

  doc.setDrawColor(...INK_300);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 18, MARGIN + 200, y + 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...INK_500);
  doc.text("PREPARED BY", MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK_900);
  doc.text(signatureName || preparedBy || orgName, MARGIN, y + 30);
  // Secondary line: show the prepared-by name (or org) under the signed name.
  const secondary = signatureName ? preparedBy || orgName : preparedBy ? orgName : "";
  if (secondary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK_500);
    doc.text(secondary, MARGIN, y + 44);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...INK_500);
  doc.text("CUSTOMER ACCEPTANCE", MARGIN + 300, y);
  doc.setDrawColor(...INK_300);
  doc.line(MARGIN + 300, y + 18, PAGE_W - MARGIN, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...INK_400);
  doc.text("Signature / Date", MARGIN + 300, y + 28);

  return y + 52;
}

// ─── Public entry point ────────────────────────────────────────────────────
/**
 * Render a branded freight quote and return it as a base64 data URI
 * (`data:application/pdf;base64,...`). Does NOT trigger a download — the
 * caller forwards the data URI to the `quote-generate-pdf` edge function.
 */
export async function exportQuotePdf(
  quote: Quote,
  lineItems: QuoteLineItem[],
  opts: ExportQuotePdfOptions = {},
): Promise<string> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  const branding = resolveBranding(opts);
  const orgName = clean(branding.company_name) || BRAND.wordmark;

  // Pre-load image dimensions up-front (async) so the synchronous draw passes
  // — including the per-page chrome stamp — can place them with correct aspect
  // ratio. Either resolve to null on failure → text fallbacks kick in.
  const [logo, signature] = await Promise.all([
    resolveLogoPlacement(branding.logo_url, 32, 150),
    resolveLogoPlacement(branding.signature_url, 30, 180),
  ]);

  let y = HEADER_H + 30;
  y = drawTitleBlock(doc, quote, opts, branding, y);
  y = drawCustomerAndLane(doc, quote, opts, y + 6);

  y = ensureRoom(doc, y, 120);
  y = drawLineItems(doc, quote, lineItems ?? [], y + 4);

  y = ensureRoom(doc, y, 120);
  y = drawTotals(doc, quote, y);

  y = ensureRoom(doc, y, 140);
  drawTermsAndSignature(doc, quote, branding, signature, y + 8);

  stampPageChrome(doc, orgName, logo);

  return doc.output("datauristring");
}
