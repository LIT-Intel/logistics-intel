// Always use Vercel proxy in browser to avoid CORS and ensure consistent routing
const API_BASE = '/api/lit';

async function handle(res: Response) {
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function createCompany(payload: { name: string; website?: string; plan?: 'Free'|'Pro'|'Enterprise'; external_ref?: string; }) {
  const res = await fetch(`${API_BASE}/crm/companies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle(res);
}

export async function getCompany(id: number | string) {
  const res = await fetch(`${API_BASE}/crm/companies/${id}`, { headers: { 'accept': 'application/json' } });
  return handle(res);
}

export async function createContact(payload: { companyId: number; fullName: string; email?: string; linkedin?: string; phone?: string; title?: string; source?: string; }) {
  const res = await fetch(`${API_BASE}/crm/contacts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle(res);
}

export async function logOutreach(payload: { companyId: number; contactId?: number; channel: 'email'|'linkedin'; subject?: string; snippet?: string; status: string; meta?: any; }) {
  const res = await fetch(`${API_BASE}/crm/outreach`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle(res);
}

export async function getFeatureFlags() {
  const res = await fetch(`${API_BASE}/crm/feature-flags`, { headers: { 'accept': 'application/json' } });
  return handle(res);
}

