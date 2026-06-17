// CSV export of the current selection or filtered view. Includes all the
// V6-rich columns we ingested + opportunity scores + freshness chip.

const COLUMNS = [
  { key: 'company_name', label: 'Company' },
  { key: 'domain', label: 'Domain' },
  { key: 'industry', label: 'Industry' },
  { key: 'vertical', label: 'Vertical' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'employee_count', label: 'Employees' },
  { key: 'revenue', label: 'Annual Revenue (B)' },
  { key: 'teu', label: 'TEU 12m' },
  { key: 'shipments', label: 'Shipments 12m' },
  { key: 'lcl', label: 'LCL Shipments' },
  { key: 'value_usd', label: 'Spend 12m USD' },
  { key: 'gp_potential', label: 'GP Potential' },
  { key: 'top_forwarder_1', label: 'Top Forwarder #1' },
  { key: 'top_forwarder_1_pct', label: 'Top Forwarder #1 %' },
  { key: 'top_lane_1', label: 'Top Lane #1' },
  { key: 'top_lane_1_pct', label: 'Top Lane #1 %' },
  { key: 'opportunity_composite_score', label: 'Opp Composite' },
  { key: 'opportunity_consolidation_score', label: 'Opp Consolidation' },
  { key: 'opportunity_vulnerable_score', label: 'Opp Vulnerable' },
  { key: 'opportunity_velocity_score', label: 'Opp Velocity' },
  { key: 'opportunity_defend_score', label: 'Opp Defend' },
  { key: 'freshness_chip', label: 'Freshness' },
  { key: 'last_refreshed_at', label: 'Last Refreshed' },
];

function escape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function expandRow(r) {
  const f1 = Array.isArray(r.top_forwarders) ? r.top_forwarders[0] : null;
  const l1 = Array.isArray(r.top_dimensions) ? r.top_dimensions[0] : null;
  return {
    ...r,
    freshness_chip: r.freshness?.chip ?? '',
    last_refreshed_at: r.freshness?.last_refreshed_at ?? r.last_refreshed_at ?? '',
    top_forwarder_1: f1?.name ?? '',
    top_forwarder_1_pct: f1?.percent ?? '',
    top_lane_1: l1?.lane ?? l1?.route ?? '',
    top_lane_1_pct: l1?.percent ?? '',
  };
}

export function rowsToCsv(rows) {
  const lines = [COLUMNS.map((c) => c.label).join(',')];
  for (const r of rows) {
    const flat = expandRow(r);
    lines.push(COLUMNS.map((c) => escape(flat[c.key])).join(','));
  }
  return lines.join('\n');
}

export function downloadCsv(rows, filename = 'pulse-explorer.csv') {
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
