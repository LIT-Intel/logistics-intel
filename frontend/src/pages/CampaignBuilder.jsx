import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

const API_BASE = '/api/lit';

async function saveCampaign(body) {
  const res = await fetch(`${API_BASE}/crm/campaigns`, {
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

export default function CampaignBuilder() {
  const [name, setName] = useState('Search Audience');
  const [channel, setChannel] = useState('email');
  const [ids, setIds] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const company_ids = ids.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (!company_ids.length) {
      alert('Please enter at least one company_id');
      return;
    }
    setSaving(true);
    try {
      const r = await saveCampaign({ name, channel, company_ids });
      alert(`Campaign saved: ${r?.campaign_id || 'ok'}`);
    } catch (e) {
      alert(`Save failed: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">New Campaign</h1>
      <input className="border rounded px-3 py-2 w-full" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Campaign name"/>
      <select className="border rounded px-3 py-2" value={channel} onChange={(e)=>setChannel(e.target.value)}>
        <option value="email">Email</option>
        <option value="linkedin">LinkedIn</option>
      </select>
      <textarea className="border rounded px-3 py-2 w-full h-32" value={ids} onChange={(e)=>setIds(e.target.value)} placeholder="company_ids (comma or space separated)"></textarea>
      <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
    </div>
  );
}

