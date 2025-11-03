import React, { useState } from 'react';

const API_BASE = '/api/lit';

async function createCompany(body: { name: string; domain?: string; city?: string; state?: string; country?: string }) {
  const res = await fetch(`${API_BASE}/crm/company.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function CreateCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const [form, setForm] = useState({ name: '', domain: '', city: '', state: '', country: 'US' });
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  return (
    <div className='fixed inset-0 bg-black/30 flex items-center justify-center p-4'>
      <div className='rounded-2xl bg-white w-full max-w-lg p-5 space-y-3'>
        <h3 className='text-lg font-bold'>Add Company</h3>
        <div className='grid grid-cols-2 gap-3'>
          <input className='border rounded p-2 col-span-2' placeholder='Company Name*' value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className='border rounded p-2 col-span-2' placeholder='Domain (optional)' value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} />
          <input className='border rounded p-2' placeholder='City' value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          <input className='border rounded p-2' placeholder='State' value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
          <input className='border rounded p-2 col-span-2' placeholder='Country (default US)' value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
        </div>
        <div className='flex gap-2 justify-end'>
          <button className='px-3 py-1.5 rounded border' onClick={onClose}>Cancel</button>
          <button disabled={busy || !form.name} className='px-3 py-1.5 rounded border bg-slate-900 text-white' onClick={async () => {
            setBusy(true);
            try {
              const r: any = await createCompany({ name: form.name, domain: form.domain || undefined, city: form.city || undefined, state: form.state || undefined, country: form.country || 'US' } as any);
              const id = String(r?.company_id || r?.id || form.name.toLowerCase().replace(/[^a-z0-9]+/g,'-'));
              onCreated(id, form.name);
            } catch (e) {
              // Fallback: create locally when API not live
              const id = 'comp_' + Math.random().toString(36).slice(2, 8);
              onCreated(id, form.name);
            } finally {
              setBusy(false);
              onClose();
            }
          }}>Create</button>
        </div>
      </div>
    </div>
  );
}

