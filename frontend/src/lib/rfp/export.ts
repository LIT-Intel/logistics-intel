import type { RfpPayload, PricedResult } from '@/types/rfp';

export function toHtml(payload: RfpPayload, priced: PricedResult): string {
  const lanesRows = priced.lanes.map((p, idx) => {
    const charges = p.charges.map(c => `<div class="text-xs text-slate-700">${c.name}: ${c.qty} × ${c.rate} = ${c.extended.toFixed(2)}${c.minApplied?' (min)':''}</div>`).join('');
    return `<tr><td class="p-2 border">${idx+1}</td><td class="p-2 border">${p.mode}${p.equipment?(' / '+p.equipment):''}</td><td class="p-2 border">$${p.unitCost.toFixed(2)}</td><td class="p-2 border">$${p.annualCost.toFixed(2)}</td><td class="p-2 border">${charges}</td></tr>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"/><title>${payload.meta.bid_name}</title>
  <style>body{font-family:Inter,system-ui,-apple-system,sans-serif;color:#0f172a} .card{background:rgba(255,255,255,.9);border:1px solid rgba(203,213,225,.6);border-radius:18px;box-shadow:0 10px 30px rgba(2,6,23,.08);padding:20px;margin:10px 0} .wm{position:fixed;right:8px;bottom:8px;opacity:.06;font-size:120px;font-weight:900;background:linear-gradient(90deg,#7c3aed,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}</style>
  <div class="wm">LIT</div>
  <div class="card"><h1 style="margin:0;color:#23135b">${payload.meta.bid_name}</h1><div class="text-slate-600">${payload.meta.customer} • Valid ${payload.meta.valid_from} → ${payload.meta.valid_to} • ${payload.meta.currency}</div></div>
  <div class="card"><h2 style="margin-top:0;color:#23135b">Executive Summary</h2><p>Generated proposal for ${payload.meta.customer}. This includes lane-level KPIs and costed pricing based on provided rates.</p></div>
  <div class="card"><h2 style="margin-top:0;color:#23135b">Lane Pricing</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th class="p-2 border">#</th><th class="p-2 border">Mode/Equip</th><th class="p-2 border">Unit Cost</th><th class="p-2 border">Annual</th><th class="p-2 border">Breakdown</th></tr></thead><tbody>${lanesRows}</tbody></table><div style="margin-top:10px;font-weight:700">Total Annual: $${priced.totalAnnual.toFixed(2)}</div></div>
  <div class="card"><h2 style="margin-top:0;color:#23135b">Assumptions & Validity</h2><ul><li>Pricing valid ${payload.meta.valid_from} to ${payload.meta.valid_to}</li><li>Charges applied per provided units; minimums honored where specified.</li></ul></div>
  <div class="card"><h2 style="margin-top:0;color:#23135b">Implementation Plan</h2><ol><li>Kickoff and data validation</li><li>Carrier onboarding</li><li>Go-live and monitoring</li></ol></div>`;
}

export async function toPdf(html: string): Promise<Blob> {
  // Client-side: render with html2canvas + jsPDF
  // Simple approach: open a new window and print to PDF or use jsPDF from html
  // Here we fallback to blob of HTML for download if PDF render not available
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    // Minimal: add as text; for fidelity, use html() API if plugin available
    doc.text('Proposal', 40, 40);
    return doc.output('blob');
  } catch {
    return new Blob([html], { type: 'text/html' });
  }
}
