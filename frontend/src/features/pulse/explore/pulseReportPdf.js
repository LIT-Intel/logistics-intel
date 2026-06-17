// pulseReportPdf — client-side PDF report builder for the Pulse Explorer
// Insights chat. Uses jsPDF + jspdf-autotable (already in deps).
//
// Inputs: a question + answer (markdown), the current rows + filters +
// summary stats. Output: a PDF that either triggers a browser download
// or returns a Blob (for emailing via the edge fn).
//
// Layout: title bar, generated-on timestamp, filter chip line, KPI
// table, the question, the coach's markdown answer rendered as plain
// text (bold markers stripped), and a top-10 accounts table.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── LIT brand palette ─────────────────────────────────────────────────────
// Mirrors frontend/public/pulse-icon-master.svg and the in-app Explorer
// header (bg-[#0F1828]). Cyan ramp pulls from Tailwind cyan-700/500/100.
const LIT_NAVY = [2, 6, 23];           // #020617 — pulse logo bg + header bar
const LIT_NAVY_SOFT = [15, 24, 40];    // #0F1828 — app header bg
const LIT_CYAN_NEON = [0, 224, 255];   // #00E0FF — pulse stroke + accent line
const LIT_CYAN_600 = [8, 145, 178];    // #0891B2 — section labels
const LIT_CYAN_50 = [236, 254, 255];   // #ECFEFF — KPI table fill
const LIT_SLATE_900 = [15, 23, 42];
const LIT_SLATE_600 = [71, 85, 105];
const LIT_SLATE_400 = [148, 163, 184];
const LIT_SLATE_200 = [226, 232, 240];

// Mirrors public/pulse-icon-master.svg (a rounded-square nav with a
// cyan EKG waveform + a dot at the right). We re-draw the same shape
// natively so the PDF stays self-contained — no external assets to
// embed or fetch. Coordinates are scaled from the SVG's 64×64 viewBox.
function drawPulseLogo(doc, x, y, size) {
  const s = size / 64; // SVG viewBox scale factor
  // Rounded-square background — LIT navy.
  doc.setFillColor(...LIT_NAVY);
  doc.roundedRect(x, y, size, size, size * 0.25, size * 0.25, 'F');
  // EKG waveform — neon cyan stroke.
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(s * 4.8);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  // Path: M 8,32 → H 20 → L 26,22 → L 32,42 → L 38,32 → H 56
  const pts = [
    [8, 32], [20, 32], [26, 22], [32, 42], [38, 32], [56, 32],
  ];
  for (let i = 1; i < pts.length; i++) {
    doc.line(x + pts[i - 1][0] * s, y + pts[i - 1][1] * s, x + pts[i][0] * s, y + pts[i][1] * s);
  }
  // Trailing dot.
  doc.setFillColor(...LIT_CYAN_NEON);
  doc.circle(x + 56 * s, y + 32 * s, 3 * s, 'F');
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtMoneyM(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}B`;
  if (n >= 1) return `$${n.toFixed(1)}M`;
  return `$${(n * 1000).toFixed(0)}k`;
}

function stripMarkdown(md) {
  if (!md) return '';
  return String(md)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');
}

function filterSummary(filters) {
  if (!filters) return 'No active filters';
  const parts = [];
  if (filters.industry?.length) parts.push(`Industry: ${filters.industry.slice(0, 4).join(', ')}`);
  if (filters.country?.length) parts.push(`Country: ${filters.country.slice(0, 4).join(', ')}`);
  if (filters.region) parts.push(`Region: ${filters.region}`);
  if (filters.state?.length) parts.push(`State: ${filters.state.slice(0, 4).join(', ')}`);
  if (filters.opportunity_type?.length) parts.push(`Opportunity: ${filters.opportunity_type.join(', ')}`);
  if (filters.teu_min != null || filters.teu_max != null) parts.push(`TEU: ${filters.teu_min ?? 0}–${filters.teu_max ?? '∞'}`);
  if (filters.freshness?.length) parts.push(`Freshness: ${filters.freshness.join(', ')}`);
  return parts.length ? parts.join('  •  ') : 'No active filters';
}

export function generatePulseReportPdf({
  title = 'LIT Pulse Report',
  question,
  answerMd,
  rows = [],
  filters,
  summary,
  returnBlob = false,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // ── Branded header bar — LIT navy with the Pulse mark + neon accent ──
  const HEADER_H = 62;
  doc.setFillColor(...LIT_NAVY);
  doc.rect(0, 0, pageW, HEADER_H, 'F');
  // Pulse logo at left
  drawPulseLogo(doc, margin, 14, 34);
  // Title block
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, margin + 46, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...LIT_CYAN_NEON);
  doc.text('LIT  ·  PULSE EXPLORER', margin + 46, 44);
  // Timestamp at right
  doc.setTextColor(...LIT_SLATE_400);
  doc.setFontSize(8.5);
  doc.text(new Date().toLocaleString(), pageW - margin, 44, { align: 'right' });
  // Neon accent line beneath the bar
  doc.setDrawColor(...LIT_CYAN_NEON);
  doc.setLineWidth(1.4);
  doc.line(0, HEADER_H, pageW, HEADER_H);

  y = HEADER_H + 22;
  doc.setTextColor(...LIT_SLATE_900);

  // Filters line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...LIT_CYAN_600);
  doc.text('FILTERS', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...LIT_SLATE_600);
  const filtersLines = doc.splitTextToSize(filterSummary(filters), pageW - margin * 2);
  doc.text(filtersLines, margin, y + 13);
  y += 13 + filtersLines.length * 12 + 14;

  // KPI table
  doc.setTextColor(...LIT_SLATE_900);
  const total = rows.length;
  const totalRev = rows.reduce((a, r) => {
    const v = Number(r.revenue); return Number.isFinite(v) ? a + v : a;
  }, 0);
  const totalTeu = rows.reduce((a, r) => {
    const v = typeof r.teu === 'number' ? r.teu : Number(r.teu ?? 0); return Number.isFinite(v) ? a + v : a;
  }, 0);
  const totalShip = rows.reduce((a, r) => a + (Number(r.shipments) || 0), 0);
  const avgOpp = total ? Math.round(rows.reduce((a, r) => a + (Number(r.opportunity_composite_score) || 0), 0) / total) : 0;

  autoTable(doc, {
    startY: y,
    head: [['Accounts', 'Annual revenue', 'TEU (12mo)', 'Shipments (12mo)', 'Avg opp score']],
    body: [[
      total.toLocaleString(),
      fmtMoneyM(totalRev),
      fmtNum(totalTeu),
      fmtNum(totalShip),
      `${avgOpp}/100`,
    ]],
    headStyles: { fillColor: LIT_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 10, fillColor: LIT_CYAN_50, textColor: LIT_SLATE_900 },
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { lineColor: LIT_SLATE_200, lineWidth: 0.4 },
  });
  y = doc.lastAutoTable.finalY + 18;

  // Question
  if (question) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...LIT_CYAN_600);
    doc.text('QUESTION', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...LIT_SLATE_900);
    const qLines = doc.splitTextToSize(question, pageW - margin * 2);
    doc.text(qLines, margin, y + 13);
    y += 13 + qLines.length * 12 + 14;
  }

  // Answer
  if (answerMd) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...LIT_CYAN_600);
    doc.text('COACH RESPONSE', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...LIT_SLATE_900);
    const plain = stripMarkdown(answerMd);
    const aLines = doc.splitTextToSize(plain, pageW - margin * 2);
    let yLine = y + 14;
    const pageH = doc.internal.pageSize.getHeight();
    for (const line of aLines) {
      if (yLine > pageH - margin) {
        doc.addPage();
        yLine = margin;
      }
      doc.text(line, margin, yLine);
      yLine += 12;
    }
    y = yLine + 12;
  }

  // Top accounts table — up to 15 rows ranked by opportunity score.
  if (rows.length) {
    const pageH = doc.internal.pageSize.getHeight();
    if (y > pageH - 200) { doc.addPage(); y = margin; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...LIT_CYAN_600);
    doc.text('ACCOUNTS', margin, y);
    // Cap at 500 to keep the PDF a sane size — autoTable auto-paginates
    // the body across pages. When the user has more than the cap, we
    // surface that in the caption so they know what's in the report.
    const ROW_CAP = 500;
    const sorted = [...rows]
      .sort((a, b) => (Number(b.opportunity_composite_score) || 0) - (Number(a.opportunity_composite_score) || 0));
    const top = sorted.slice(0, ROW_CAP);
    const caption = sorted.length > ROW_CAP
      ? `Showing top ${ROW_CAP.toLocaleString()} of ${sorted.length.toLocaleString()} accounts by opportunity score`
      : `${sorted.length.toLocaleString()} account${sorted.length === 1 ? '' : 's'} included`;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...LIT_SLATE_600);
    doc.text(caption, margin, y + 12);
    doc.setTextColor(...LIT_SLATE_900);
    autoTable(doc, {
      startY: y + 22,
      head: [['Company', 'Location', 'TEU', 'Revenue', 'Opp']],
      body: top.map((r) => [
        r.company_name ?? '—',
        [r.city, r.state, r.country].filter(Boolean).join(', ') || '—',
        fmtNum(r.teu),
        fmtMoneyM(r.revenue),
        r.opportunity_composite_score != null ? `${Math.round(r.opportunity_composite_score)}/100` : '—',
      ]),
      headStyles: { fillColor: LIT_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: LIT_SLATE_900 },
      alternateRowStyles: { fillColor: LIT_CYAN_50 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      margin: { left: margin, right: margin },
      theme: 'striped',
      styles: { lineColor: LIT_SLATE_200, lineWidth: 0.3 },
    });
  }

  // Branded footer on every page — navy bar + mini pulse mark.
  const pages = doc.getNumberOfPages();
  const FOOTER_H = 26;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...LIT_NAVY);
    doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H, 'F');
    doc.setDrawColor(...LIT_CYAN_NEON);
    doc.setLineWidth(0.8);
    doc.line(0, pageH - FOOTER_H, pageW, pageH - FOOTER_H);
    drawPulseLogo(doc, margin, pageH - FOOTER_H + 5, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('LIT  ·  PULSE EXPLORER', margin + 22, pageH - FOOTER_H + 16);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...LIT_CYAN_NEON);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - FOOTER_H + 16, { align: 'right' });
  }

  if (returnBlob) {
    return doc.output('blob');
  }
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`lit-pulse-report-${stamp}.pdf`);
  return null;
}
