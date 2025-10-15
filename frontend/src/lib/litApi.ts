// Force all browser calls through Vercel proxy to ensure consistent CORS and routing
const BASE = '/api/lit';

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

  // User Settings: Notifications
  notificationsSlack: (url: string) =>
    fetch(`${BASE}/user/settings/notifications/slack`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    }).then(j),
  notificationsTeams: (url: string) =>
    fetch(`${BASE}/user/settings/notifications/teams`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    }).then(j),
  notificationsAlerts: (flags: any) =>
    fetch(`${BASE}/user/settings/alerts`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(flags || {})
    }).then(j),

  // User Settings: Campaign Defaults
  saveCampaignDefaults: (payload: any) =>
    fetch(`${BASE}/user/settings/campaignDefaults`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(j),

  // User Security
  securityPassword: (current: string, next: string) =>
    fetch(`${BASE}/user/security/password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current, next })
    }).then(j),
  securityMfa: (enabled: boolean) =>
    fetch(`${BASE}/user/security/mfa`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled })
    }).then(j),
  securityTokenGenerate: () =>
    fetch(`${BASE}/user/security/tokens/generate`, { method: 'POST' }).then(j),
  securityTokenRevoke: (tokenId: string) =>
    fetch(`${BASE}/user/security/tokens/revoke`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokenId })
    }).then(j),

  // Billing
  billingUpdatePaymentMethod: () =>
    fetch(`${BASE}/billing/updatePaymentMethod`, { method: 'POST' }).then(j),
  billingInvoices: () =>
    fetch(`${BASE}/billing/invoices`).then(j),

  // Admin Settings (optional persistence)
  adminSaveProviders: (payload: any) =>
    fetch(`${BASE}/admin/settings/providers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(j),
};