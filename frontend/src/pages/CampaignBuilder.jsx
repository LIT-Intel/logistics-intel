import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { saveCampaign, sendCampaignEmail } from '@/lib/api';

export default function CampaignBuilder() {
  const [name, setName] = useState('Search Audience');
  const [channel, setChannel] = useState('email');
  const [ids, setIds] = useState('');
  const [saving, setSaving] = useState(false);

  const [campaignEmailId, setCampaignEmailId] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

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
    } catch (e: any) {
      alert(`Save failed: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function onSendTestEmail() {
    if (!campaignEmailId.trim()) {
      alert('Please enter a campaign_email_id');
      return;
    }

    setSendingTestEmail(true);
    setSendResult(null);

    try {
      const result = await sendCampaignEmail(campaignEmailId.trim());
      const providerMessageId = result?.provider_message_id || 'sent';
      setSendResult(`Success. Provider message id: ${providerMessageId}`);
      alert('Test campaign email sent successfully');
    } catch (e: any) {
      const message = String(e?.message || e);
      setSendResult(`Failed: ${message}`);
      alert(`Send failed: ${message}`);
    } finally {
      setSendingTestEmail(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">New Campaign</h1>

      <input
        className="border rounded px-3 py-2 w-full"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Campaign name"
      />

      <select
        className="border rounded px-3 py-2"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
      >
        <option value="email">Email</option>
        <option value="linkedin">LinkedIn</option>
      </select>

      <textarea
        className="border rounded px-3 py-2 w-full h-32"
        value={ids}
        onChange={(e) => setIds(e.target.value)}
        placeholder="company_ids (comma or space separated)"
      />

      <Button
        className="bg-indigo-600 hover:bg-indigo-700 text-white"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>

      <div className="border rounded-xl p-4 space-y-3 bg-white">
        <div>
          <h2 className="text-lg font-semibold">Send Test Campaign Email</h2>
          <p className="text-sm text-slate-500 mt-1">
            Paste a real <code>campaign_email_id</code> from the database to test the send function from the UI.
          </p>
        </div>

        <input
          className="border rounded px-3 py-2 w-full"
          value={campaignEmailId}
          onChange={(e) => setCampaignEmailId(e.target.value)}
          placeholder="campaign_email_id"
        />

        <Button
          className="bg-slate-900 hover:bg-slate-800 text-white"
          onClick={onSendTestEmail}
          disabled={sendingTestEmail}
        >
          {sendingTestEmail ? 'Sending…' : 'Send Test Email'}
        </Button>

        {sendResult ? (
          <div className="text-sm rounded-lg bg-slate-50 border px-3 py-2 text-slate-700">
            {sendResult}
          </div>
        ) : null}
      </div>
    </div>
  );
}
