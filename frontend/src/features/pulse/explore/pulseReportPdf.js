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

  // Header bar
  doc.setFillColor(8, 145, 178); // cyan-700
  doc.rect(0, 0, pageW, 48, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, margin, 30);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleString(), pageW - margin, 30, { align: 'right' });

  y = 76;
  doc.setTextColor(15, 23, 42);

  // Filters line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Filters', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const filtersLines = doc.splitTextToSize(filterSummary(filters), pageW - margin * 2);
  doc.text(filtersLines, margin, y + 14);
  y += 14 + filtersLines.length * 12 + 12;

  // KPI table
  doc.setTextColor(15, 23, 42);
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
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 16;

  // Question
  if (question) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Question', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const qLines = doc.splitTextToSize(question, pageW - margin * 2);
    doc.text(qLines, margin, y + 14);
    y += 14 + qLines.length * 12 + 12;
  }

  // Answer
  if (answerMd) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Coach response', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
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
    doc.setFontSize(11);
    doc.text('Top accounts', margin, y);
    const top = [...rows]
      .sort((a, b) => (Number(b.opportunity_composite_score) || 0) - (Number(a.opportunity_composite_score) || 0))
      .slice(0, 15);
    autoTable(doc, {
      startY: y + 8,
      head: [['Company', 'Location', 'TEU', 'Revenue', 'Opp']],
      body: top.map((r) => [
        r.company_name ?? '—',
        [r.city, r.state, r.country].filter(Boolean).join(', ') || '—',
        fmtNum(r.teu),
        fmtMoneyM(r.revenue),
        r.opportunity_composite_score != null ? `${Math.round(r.opportunity_composite_score)}/100` : '—',
      ]),
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      margin: { left: margin, right: margin },
      theme: 'striped',
    });
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`LIT Pulse Explorer · Page ${i} of ${pages}`, margin, doc.internal.pageSize.getHeight() - 16);
    doc.text('Generated by Pulse Coach', pageW - margin, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
  }

  if (returnBlob) {
    return doc.output('blob');
  }
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`lit-pulse-report-${stamp}.pdf`);
  return null;
}
