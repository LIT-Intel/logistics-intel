/**
 * Client-side PDF export for the Pulse AI Brief.
 *
 * Mirrors the approach in exportPulseLiveReportPdf.ts — jsPDF drawing
 * directly, deterministic page-by-page output. Doesn't depend on the
 * browser's print dialog, blob URLs, or @media print CSS — which were
 * all unreliable in earlier rounds (Storage MIME type, popup blockers,
 * print-preview clipping).
 *
 * The brief is prose-heavy with a few bullet sections, so we use
 * doc.splitTextToSize for word-wrap and a small manual layout engine
 * that tracks `y` and triggers addPage() when content would overflow
 * the bottom margin. Page header is stamped onto every page after the
 * content is laid out so we know the total page count.
 */

import jsPDF from "jspdf";
import { BRAND, PDF_PAGE } from "./reportBrand";
import {
  mergeText,
  sectionAllBullets,
  sectionText,
  type PulseBriefShape,
} from "./pulseBriefHtml";

// ─── Layout constants ─────────────────────────────────────────────────────
const PROSE_FONT_SIZE = 10.5;
const PROSE_LINE_HEIGHT = 14;
const SECTION_TITLE_FONT_SIZE = 12;
const SECTION_GAP = 18;
const PAGE_BOTTOM = PDF_PAGE.height - PDF_PAGE.marginBottom;
const CONTENT_WIDTH = PDF_PAGE.width - PDF_PAGE.marginX * 2;

interface ExportArgs {
  companyName: string;
  brief: PulseBriefShape;
  generatedAt?: Date;
}

export function exportPulseBriefPdf(args: ExportArgs): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const generatedAt = args.generatedAt ?? new Date();

  // Layout pass — content first, headers/footers stamped at the end.
  drawBrandHeader(doc, args.companyName, generatedAt);
  let y = PDF_PAGE.marginTop;

  y = drawBriefBody(doc, args.brief, y);

  // Now that we know how many pages content fills, stamp the running
  // header (Logistic Intel · Pulse Brief) on pages 2+ and add the footer
  // disclosure on every page. Page 1 already has the full hero header.
  stampRunningHeader(doc);
  drawFooter(doc, args.companyName, generatedAt);

  const slug = args.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const dateStamp = generatedAt.toISOString().slice(0, 10);
  doc.save(`LIT-Pulse-Brief-${slug || "company"}-${dateStamp}.pdf`);
}

// ─── Hero (page 1) ────────────────────────────────────────────────────────

function drawBrandHeader(
  doc: jsPDF,
  companyName: string,
  generatedAt: Date,
): void {
  // Dark hero band, full width.
  doc.setFillColor(BRAND.gradientStart);
  doc.rect(0, 0, PDF_PAGE.width, 72, "F");

  // Cyan square + LIT mark.
  doc.setFillColor(BRAND.accentCyan);
  doc.roundedRect(PDF_PAGE.marginX, 20, 28, 28, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(BRAND.mark, PDF_PAGE.marginX + 14, 39, { align: "center" });

  // Wordmark.
  doc.setTextColor(248, 250, 252);
  doc.setFontSize(13);
  doc.text(BRAND.wordmark, PDF_PAGE.marginX + 38, 33);

  // Subtitle.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 240, 255);
  doc.text(
    `Pulse AI Brief · ${generatedAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}`,
    PDF_PAGE.marginX + 38,
    47,
  );

  // Company name (right-aligned in hero).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(companyName, PDF_PAGE.width - PDF_PAGE.marginX, 39, {
    align: "right",
  });
}

// ─── Running header (pages 2+) ────────────────────────────────────────────

function stampRunningHeader(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8.5);
    doc.setTextColor(BRAND.textMuted);
    doc.text("Logistic Intel · Pulse AI Brief", PDF_PAGE.marginX, 28);
    // Thin divider beneath the running header.
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(
      PDF_PAGE.marginX,
      36,
      PDF_PAGE.width - PDF_PAGE.marginX,
      36,
    );
  }
}

// ─── Footer ───────────────────────────────────────────────────────────────

function drawFooter(
  doc: jsPDF,
  companyName: string,
  _generatedAt: Date,
): void {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(BRAND.textMuted);
    doc.text(
      `Logistic Intel · ${BRAND.footerCity} · logisticintel.com`,
      PDF_PAGE.marginX,
      PDF_PAGE.height - 24,
    );
    doc.text(
      `${companyName} — Page ${i} of ${pageCount}`,
      PDF_PAGE.width - PDF_PAGE.marginX,
      PDF_PAGE.height - 24,
      { align: "right" },
    );
  }
}

// ─── Body — sections in order ─────────────────────────────────────────────

function drawBriefBody(doc: jsPDF, brief: PulseBriefShape, startY: number): number {
  const r = brief?.report;
  let y = startY;

  if (!r) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PROSE_FONT_SIZE);
    doc.setTextColor(BRAND.textMuted);
    doc.text(
      "Pulse AI brief has not been generated yet.",
      PDF_PAGE.marginX,
      y,
    );
    return y + PROSE_LINE_HEIGHT;
  }

  // Mirror the section order used by the on-screen renderer + email body
  // so the user sees the same content layout in all three surfaces.
  const proseSections: Array<{ label: string; text: string; accent: [number, number, number] }> = [
    { label: "Executive summary", text: mergeText(r.company_summary, r.why_now), accent: [59, 130, 246] },
    { label: "Sales angle", text: sectionText(r.sales_angle), accent: [139, 92, 246] },
    { label: "LIT verified trade data", text: sectionText(r.lit_verified_trade_data), accent: [14, 165, 233] },
    { label: "External web signals", text: sectionText(r.external_web_signals), accent: [245, 158, 11] },
  ];

  const bulletSections: Array<{ label: string; items: string[]; accent: [number, number, number] }> = [
    { label: "Buying signals", items: sectionAllBullets(r.buying_signals), accent: [16, 185, 129] },
    { label: "Risk flags", items: sectionAllBullets(r.risk_flags), accent: [239, 68, 68] },
    { label: "Carrier opportunities", items: sectionAllBullets(r.carrier_opportunities), accent: [59, 130, 246] },
    { label: "Forwarder displacement", items: sectionAllBullets(r.forwarder_displacement_opportunities), accent: [99, 102, 241] },
    { label: "Lane insights", items: sectionAllBullets(r.lane_insights), accent: [14, 165, 233] },
    { label: "Supplier insights", items: sectionAllBullets(r.supplier_insights), accent: [20, 184, 166] },
  ];

  for (const s of proseSections) {
    if (!s.text) continue;
    y = drawProseSection(doc, s.label, s.text, s.accent, y);
  }

  for (const s of bulletSections) {
    if (!s.items.length) continue;
    y = drawBulletSection(doc, s.label, s.items, s.accent, y);
  }

  // Suggested email opener — italic, light blue background block, single
  // paragraph (no bullets). Useful for sales prep.
  const opener =
    Array.isArray(r.email_openers) && r.email_openers.length ? r.email_openers[0] : null;
  if (opener) {
    y = drawProseSection(
      doc,
      "Suggested email opener",
      opener,
      [14, 165, 233],
      y,
      { italic: true },
    );
  }

  return y;
}

// ─── Prose section ────────────────────────────────────────────────────────

function drawProseSection(
  doc: jsPDF,
  label: string,
  text: string,
  accent: [number, number, number],
  startY: number,
  opts: { italic?: boolean } = {},
): number {
  let y = ensureRoom(doc, startY, PROSE_LINE_HEIGHT * 3);
  y = drawEyebrow(doc, label, accent, y);

  // Body text, word-wrapped.
  doc.setFont("helvetica", opts.italic ? "italic" : "normal");
  doc.setFontSize(PROSE_FONT_SIZE);
  doc.setTextColor(15, 23, 42);

  // splitTextToSize handles natural word-wrap to the given width. Then
  // we draw line by line so we can page-break mid-paragraph cleanly.
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  for (const line of lines) {
    y = ensureRoom(doc, y, PROSE_LINE_HEIGHT);
    doc.text(line, PDF_PAGE.marginX, y);
    y += PROSE_LINE_HEIGHT;
  }
  return y + SECTION_GAP;
}

// ─── Bullet section ───────────────────────────────────────────────────────

function drawBulletSection(
  doc: jsPDF,
  label: string,
  items: string[],
  accent: [number, number, number],
  startY: number,
): number {
  let y = ensureRoom(doc, startY, PROSE_LINE_HEIGHT * 3);
  y = drawEyebrow(doc, label, accent, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(PROSE_FONT_SIZE);
  doc.setTextColor(15, 23, 42);

  const bulletIndent = 14;
  const textX = PDF_PAGE.marginX + bulletIndent;
  const textWidth = CONTENT_WIDTH - bulletIndent;

  for (const item of items) {
    const wrapped = doc.splitTextToSize(item, textWidth);
    if (!wrapped.length) continue;
    y = ensureRoom(doc, y, PROSE_LINE_HEIGHT);

    // Dot bullet centered on the first text line's cap height.
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.circle(PDF_PAGE.marginX + 3, y - 3, 1.6, "F");

    for (let i = 0; i < wrapped.length; i++) {
      if (i > 0) y = ensureRoom(doc, y, PROSE_LINE_HEIGHT);
      doc.text(wrapped[i], textX, y);
      y += PROSE_LINE_HEIGHT;
    }
    y += 2; // small inter-bullet gap
  }
  return y + SECTION_GAP - 2;
}

// ─── Section eyebrow (colored uppercase label) ────────────────────────────

function drawEyebrow(
  doc: jsPDF,
  label: string,
  accent: [number, number, number],
  y: number,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SECTION_TITLE_FONT_SIZE);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(label.toUpperCase(), PDF_PAGE.marginX, y);
  // Thin accent underline.
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(1.2);
  doc.line(
    PDF_PAGE.marginX,
    y + 4,
    PDF_PAGE.marginX + 36,
    y + 4,
  );
  return y + SECTION_TITLE_FONT_SIZE + 8;
}

// ─── Page-break helper ────────────────────────────────────────────────────
// Returns a Y that is guaranteed to leave at least `needed` vertical space
// above the bottom margin. Triggers addPage() + resets to top margin when
// the current page doesn't have room.

function ensureRoom(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= PAGE_BOTTOM) return y;
  doc.addPage();
  return PDF_PAGE.marginTop;
}
