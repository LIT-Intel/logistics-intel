const BASE = (process.env.NEXT_PUBLIC_API_BASE || (import.meta as any)?.env?.VITE_API_BASE || '').replace(/\/$/, '');

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const litApi = {
  searchCompanies: (body: any) =>
    fetch(`${BASE}/public/searchCompanies`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  getCompanyShipments: (company_id: string, limit = 10, offset = 0) =>
    fetch(`${BASE}/public/getCompanyShipments?company_id=${encodeURIComponent(company_id)}&limit=${limit}&offset=${offset}`).then(j),

  crmSaveCompany: (company_id: string, company_name: string, source = 'search') =>
    fetch(`${BASE}/crm/saveCompany`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_id, company_name, source }),
    }).then(j),

  crmEnrich: (company_id: string) =>
    fetch(`${BASE}/crm/enrich`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_id }),
    }).then(j),

  crmContactsEnrich: (company_id: string) =>
    fetch(`${BASE}/crm/contacts.enrich`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_id }),
    }).then(j),

  crmContactsList: (company_id: string, dept?: string) =>
    fetch(`${BASE}/crm/contacts.list?company_id=${encodeURIComponent(company_id)}${dept ? `&dept=${encodeURIComponent(dept)}` : ''}`).then(j),

  aiRecallGemini: (company_id: string, questions?: string[]) =>
    fetch(`${BASE}/ai/recall`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ai-vendor': 'gemini' },
      body: JSON.stringify({ company_id, questions }),
    }).then(j),
};