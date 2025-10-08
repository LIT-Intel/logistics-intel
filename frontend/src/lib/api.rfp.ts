const BASE = '/api/lit';
const HDRS: Record<string,string> = {
  'content-type': 'application/json',
  'accept': 'application/json',
  'x-lit-vendor': ((import.meta as any)?.env?.VITE_VENDOR_HEADER || 'LIT-RFP-STUDIO') as string,
};

async function ok<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`bad_status:${res.status}:${t.slice(0,200)}`);
  }
  return res.json();
}

export async function rfpSearchCompanies(body: any) {
  return fetch(`${BASE}/public/searchCompanies`, { method:'POST', headers: HDRS, body: JSON.stringify(body) }).then(ok);
}

export async function rfpGetCompanyShipments(companyId: string, limit=50, offset=0) {
  const url = `${BASE}/public/getCompanyShipments?company_id=${encodeURIComponent(companyId)}&limit=${limit}&offset=${offset}`;
  return fetch(url, { headers: HDRS }).then(ok);
}

export async function rfpGetBenchmark(body: { mode:'ocean'|'air', lanes: Array<{o:string,d:string,vol:number}> }) {
  // Optional backend; if 404, caller should fallback to baseline*0.87
  const url = `${BASE}/public/estimateBenchmarks`;
  const res = await fetch(url, { method:'POST', headers: HDRS, body: JSON.stringify(body) });
  if (res.status === 404) return { proposedUsd: undefined } as any;
  return ok(res);
}

export async function rfpExportHtml(body:any){
  return fetch(`${BASE}/public/export/proposalHtml`, {method:'POST', headers: HDRS, body: JSON.stringify(body)}).then(ok);
}

export async function rfpExportPdf(body:any){
  return fetch(`${BASE}/public/export/proposalPdf`, {method:'POST', headers: HDRS, body: JSON.stringify(body)}).then(ok);
}

export async function rfpAddToCampaign(body:{ companyId:string; title:string; html:string; pdfUrl?:string; }) {
  return fetch(`${BASE}/campaigns/createFromRfp`, { method:'POST', headers: HDRS, body: JSON.stringify(body) }).then(ok);
}

