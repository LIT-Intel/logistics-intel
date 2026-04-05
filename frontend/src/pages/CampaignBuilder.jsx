import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { saveCampaign, sendCampaignEmail } from '@/lib/api';

export default function CampaignBuilder() {
  const [name, setName] = useState('Search Audience');
  const [channel, setChannel] = useState('email');
  const [ids, setIds] = useState('');
  const [saving, setSaving] = useState(false);
  const [testCampaignEmailId, setTestCampaignEmailId] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  async function onSave() {
    const company_ids = ids.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
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

  async function onSendTestEmail() {
    if (!testCampaignEmailId.trim()) {
      alert('Please enter a campaign_email_id');
      return;
    }

    setSendingTest(true);
    setStatusMessage('');

    try {
      const result = await sendCampaignEmail(testCampaignEmailId.trim());
      setStatusMessage(`Test email sent successfully: ${result?.provider_message_id || 'ok'}`);
      alert('Test email sent successfully');
    } catch (e) {
      const message = String(e?.message || e);
      setStatusMessage(`Send failed: ${message}`);
      alert(`Send failed: ${message}`);
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-4">
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
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Send Test Campaign Email</h2>
        <input
          className="border rounded px-3 py-2 w-full"
          value={testCampaignEmailId}
          onChange={(e) => setTestCampaignEmailId(e.target.value)}
          placeholder="campaign_email_id"
        />
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={onSendTestEmail}
          disabled={sendingTest}
        >
          {sendingTest ? 'Sending…' : 'Send Test Email'}
        </Button>
        {statusMessage ? <p className="text-sm text-slate-600">{statusMessage}</p> : null}
      </div>
    </div>
  );
}
