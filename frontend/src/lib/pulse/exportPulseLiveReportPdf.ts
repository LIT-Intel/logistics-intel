import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BRAND, PDF_PAGE } from './reportBrand';
import type { PulseTrackedShipment, PulseDrayageEstimate, PulseLiveData } from './pulseLiveTypes';

export interface PulseLiveReportData {
  companyName: string;
  generatedAt: Date;
  shipments: PulseTrackedShipment[];
  drayage: PulseDrayageEstimate[];
  carrierMix: PulseLiveData['carrierMix'];
}

export function exportPulseLiveReportPdf(data: PulseLiveReportData) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  drawBrandHeader(doc, data);
  drawKpiSummary(doc, data);
  drawArrivalTable(doc, data);
  drawDrayageTable(doc, data);
  drawCarrierMix(doc, data);
  drawFooterDisclosure(doc);

  const slug = data.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = data.generatedAt.toISOString().slice(0, 10);
  doc.save(`LIT-PulseLIVE-${slug}-${date}.pdf`);
}

function drawBrandHeader(doc: jsPDF, data: PulseLiveReportData) {
  doc.setFillColor(BRAND.gradientStart);
  doc.rect(0, 0, PDF_PAGE.width, 70, 'F');
  doc.setFillColor(BRAND.accentCyan);
  doc.roundedRect(24, 18, 30, 30, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(BRAND.mark, 39, 39, { align: 'center' });
  doc.setFontSize(16);
  doc.text(BRAND.wordmark, 66, 38);
  doc.setFontSize(9);
  doc.setTextColor(180);
  doc.text(`Pulse LIVE report · ${data.generatedAt.toLocaleDateString('en-US')}`, 66, 54);
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(data.companyName, PDF_PAGE.width - 24, 38, { align: 'right' });
}

function drawKpiSummary(doc: jsPDF, data: PulseLiveReportData) {
  const totalShipments = data.shipments.length;
  const totalContainers = data.shipments.reduce((acc, s) => acc + (s.container_count || 0), 0);
  const totalDrayage = data.drayage.reduce((acc, d) => acc + d.est_cost_usd, 0);
  const trackedPct = totalShipments
    ? Math.round(data.shipments.filter(s => s.tracking_status === 'tracked').length / totalShipments * 100)
    : 0;
  const y = 90;
  doc.setTextColor(BRAND.textDark);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Snapshot', 36, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${totalShipments} shipments · ${totalContainers} containers · ${trackedPct}% live tracking coverage · $${totalDrayage.toLocaleString('en-US')} estimated drayage opportunity`, 36, y + 14);
}

function drawArrivalTable(doc: jsPDF, data: PulseLiveReportData) {
  autoTable(doc, {
    startY: 130,
    head: [['BOL', 'Carrier', 'POD', 'Final dest', 'Containers', 'ETA / Arrived', 'Status']],
    body: data.shipments.map((s) => [
      s.bol_number,
      s.carrier || '—',
      s.destination_port || '—',
      [s.dest_city, s.dest_state].filter(Boolean).join(', ') || '—',
      s.container_count ?? '—',
      s.tracking_arrival_actual ? `Arrived ${new Date(s.tracking_arrival_actual).toLocaleDateString('en-US')}` :
        s.tracking_eta ? `ETA ${new Date(s.tracking_eta).toLocaleDateString('en-US')}` : '—',
      s.tracking_status || '—',
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    didDrawPage: (data) => stampHeaderFooter(doc),
  });
}

function drawDrayageTable(doc: jsPDF, data: PulseLiveReportData) {
  doc.addPage();
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND.textDark);
  doc.text('Drayage Opportunity', 36, PDF_PAGE.marginTop);
  autoTable(doc, {
    startY: PDF_PAGE.marginTop + 12,
    head: [['BOL', 'Final dest', 'Miles', 'Est. value', 'Range (±25%)']],
    body: data.drayage.map((d) => [
      d.bol_number,
      [d.destination_city, d.destination_state].filter(Boolean).join(', ') || '—',
      Math.round(d.miles).toLocaleString('en-US'),
      `$${d.est_cost_usd.toLocaleString('en-US')}`,
      `$${d.est_cost_low_usd.toLocaleString('en-US')} – $${d.est_cost_high_usd.toLocaleString('en-US')}`,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    didDrawPage: (data) => stampHeaderFooter(doc),
  });
}

function drawCarrierMix(doc: jsPDF, data: PulseLiveReportData) {
  doc.addPage();
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND.textDark);
  doc.text('Carrier Mix', 36, PDF_PAGE.marginTop);
  autoTable(doc, {
    startY: PDF_PAGE.marginTop + 12,
    head: [['Carrier', 'BOLs', 'Containers', 'Live tracking']],
    body: data.carrierMix.map((c) => [c.carrier, c.bol_count, c.container_count, c.tracked ? 'Yes' : 'No']),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    didDrawPage: (data) => stampHeaderFooter(doc),
  });
}

function drawFooterDisclosure(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(BRAND.textMuted);
    doc.text(
      'Drayage estimates based on distance, container type, and port. Actual quoted rates vary ±25%.',
      36, PDF_PAGE.height - 32
    );
    doc.text(`Logistic Intel · ${BRAND.footerCity}`, 36, PDF_PAGE.height - 20);
    doc.text(`Page ${i} of ${pageCount}`, PDF_PAGE.width - 36, PDF_PAGE.height - 20, { align: 'right' });
  }
}

function stampHeaderFooter(_doc: jsPDF) {
  // header is drawn once on page 1; footer added in drawFooterDisclosure.
}
