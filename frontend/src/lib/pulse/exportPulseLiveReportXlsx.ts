import * as XLSX from 'xlsx';
import type { PulseTrackedShipment, PulseDrayageEstimate, PulseLiveData } from './pulseLiveTypes';

export interface PulseLiveXlsxData {
  companyName: string;
  generatedAt: Date;
  shipments: PulseTrackedShipment[];
  drayage: PulseDrayageEstimate[];
  carrierMix: PulseLiveData['carrierMix'];
}

export function exportPulseLiveReportXlsx(data: PulseLiveXlsxData) {
  const wb = XLSX.utils.book_new();

  const kpis = [
    ['Logistic Intel — Pulse LIVE Report'],
    [`Company: ${data.companyName}`],
    [`Generated: ${data.generatedAt.toLocaleString('en-US')}`],
    [],
    ['Total shipments', data.shipments.length],
    ['Total containers', data.shipments.reduce((a, s) => a + (s.container_count || 0), 0)],
    ['Estimated drayage opportunity', `$${data.drayage.reduce((a, d) => a + d.est_cost_usd, 0).toLocaleString('en-US')}`],
    ['Live tracking coverage', `${Math.round(data.shipments.filter(s => s.tracking_status === 'tracked').length / Math.max(1, data.shipments.length) * 100)}%`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpis), 'KPIs');

  const shipmentsSheet = data.shipments.map((s) => ({
    BOL: s.bol_number,
    Carrier: s.carrier || '',
    POD: s.destination_port || '',
    'Final dest': [s.dest_city, s.dest_state].filter(Boolean).join(', '),
    Containers: s.container_count ?? '',
    'ETA': s.tracking_eta ? new Date(s.tracking_eta).toISOString().slice(0, 10) : '',
    Arrived: s.tracking_arrival_actual ? new Date(s.tracking_arrival_actual).toISOString().slice(0, 10) : '',
    Status: s.tracking_status || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shipmentsSheet), 'Shipments');

  const drayageSheet = data.drayage.map((d) => ({
    BOL: d.bol_number,
    'Final dest': [d.destination_city, d.destination_state].filter(Boolean).join(', '),
    Miles: Math.round(d.miles),
    'Est. value (USD)': d.est_cost_usd,
    'Low (USD)': d.est_cost_low_usd,
    'High (USD)': d.est_cost_high_usd,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drayageSheet), 'Drayage');

  const carrierSheet = data.carrierMix.map((c) => ({
    Carrier: c.carrier,
    BOLs: c.bol_count,
    Containers: c.container_count,
    'Live tracking': c.tracked ? 'Yes' : 'No',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(carrierSheet), 'Carriers');

  const slug = data.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = data.generatedAt.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `LIT-PulseLIVE-${slug}-${date}.xlsx`);
}
