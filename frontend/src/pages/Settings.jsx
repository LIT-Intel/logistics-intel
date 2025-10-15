import React, { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LitPageHeader from '@/components/ui/LitPageHeader';
import LitPanel from '@/components/ui/LitPanel';
import LitWatermark from '@/components/ui/LitWatermark';
import CardPanel from '@/components/lit/CardPanel';
import { litUI } from '@/lib/uiTokens';
import { litApi } from '@/lib/litApi';
import ProfileSettings from '@/components/settings/ProfileSettings';
import BrandingSettings from '@/components/settings/BrandingSettings';
import EmailProviderSettings from '@/components/settings/EmailProviderSettings';

export default function SettingsUserCampaignStyled() {
  const [slackUrl, setSlackUrl] = useState('');
  const [teamsUrl, setTeamsUrl] = useState('');
  const [alerts, setAlerts] = useState({ newLeads: true, weeklyDigest: true, kpiDrops: false });

  const oauthBase = useMemo(() => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, ''), []);

  return (
    <div className={`relative ${litUI.pagePadding} min-h-screen`}>
      <LitWatermark />
      <LitPageHeader title="Settings" />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        <aside className={litUI.sidebar}>
          <div className="space-y-3">
            <div className="font-semibold text-[#23135b]">Quick Actions</div>
            <Button variant="outline" className="w-full border-slate-200" onClick={() => window.open(`${oauthBase}/oauth/google/start`, '_blank')}>Connect Gmail</Button>
            <Button variant="outline" className="w-full border-slate-200" onClick={() => window.open(`${oauthBase}/oauth/outlook/start`, '_blank')}>Connect Outlook</Button>
            <Button variant="outline" className="w-full border-slate-200" onClick={() => window.open(`${oauthBase}/oauth/linkedin/start`, '_blank')}>Login with LinkedIn</Button>
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          <LitPanel>
            <Tabs defaultValue="profile" className="w-full">
              <TabsList>
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="branding">Branding</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
                <TabsTrigger value="campaign">Campaign Defaults</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
                <TabsTrigger value="billing">Billing</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="mt-6">
                <ProfileSettings user={{}} onUpdate={async() => {}} />
              </TabsContent>

              <TabsContent value="branding" className="mt-6">
                <BrandingSettings user={{}} onUpdate={async() => {}} />
              </TabsContent>

              <TabsContent value="email" className="mt-6">
                <EmailProviderSettings user={{}} onUpdate={async() => {}} />
              </TabsContent>

              <TabsContent value="notifications" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <CardPanel title="Slack Webhook">
                    <Label htmlFor="slack">Webhook URL</Label>
                    <Input id="slack" placeholder="https://hooks.slack.com/services/..." value={slackUrl} onChange={(e)=>setSlackUrl(e.target.value)} className="mt-1" />
                    <div className="mt-3"><Button onClick={async()=>{ await litApi.notificationsSlack(slackUrl || ''); alert('Saved'); }} className="bg-blue-600 text-white">Save</Button></div>
                  </CardPanel>
                  <CardPanel title="Microsoft Teams Webhook">
                    <Label htmlFor="teams">Webhook URL</Label>
                    <Input id="teams" placeholder="https://outlook.office.com/webhook/..." value={teamsUrl} onChange={(e)=>setTeamsUrl(e.target.value)} className="mt-1" />
                    <div className="mt-3"><Button onClick={async()=>{ await litApi.notificationsTeams(teamsUrl || ''); alert('Saved'); }} className="bg-blue-600 text-white">Save</Button></div>
                  </CardPanel>
                  <CardPanel title="Alerts">
                    <div className="space-y-2">
                      {Object.entries(alerts).map(([k,v]) => (
                        <label key={k} className="flex items-center gap-3 text-sm">
                          <input type="checkbox" checked={v} onChange={(e)=> setAlerts(prev=>({ ...prev, [k]: e.target.checked }))} />
                          <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                        </label>
                      ))}
                      <div className="mt-2"><Button variant="outline" onClick={async()=>{ await litApi.notificationsAlerts(alerts); alert('Updated'); }}>Update Alerts</Button></div>
                    </div>
                  </CardPanel>
                </div>
              </TabsContent>

              <TabsContent value="campaign" className="mt-6">
                <CardPanel title="Sequence Defaults">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fromName">From Name</Label>
                      <Input id="fromName" placeholder="Your Name" className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="followupDays">Follow-up Days</Label>
                      <Input id="followupDays" type="number" placeholder="2" className="mt-1" />
                    </div>
                  </div>
                  <div className="mt-3"><Button onClick={async()=>{ await litApi.saveCampaignDefaults({}); alert('Saved'); }} className="bg-blue-600 text-white">Save Defaults</Button></div>
                </CardPanel>
              </TabsContent>

              <TabsContent value="security" className="mt-6">
                <div className="grid md:grid-cols-2 gap-5">
                  <CardPanel title="Change Password">
                    <Label htmlFor="current">Current</Label>
                    <Input id="current" type="password" className="mt-1" />
                    <Label htmlFor="next" className="mt-3 block">New</Label>
                    <Input id="next" type="password" className="mt-1" />
                    <div className="mt-3"><Button onClick={async()=>{ const curEl = document.getElementById('current'); const nextEl = document.getElementById('next'); const cur = curEl && 'value' in curEl ? (curEl).value : ''; const nxt = nextEl && 'value' in nextEl ? (nextEl).value : ''; await litApi.securityPassword(cur, nxt); alert('Password updated'); }}>Update</Button></div>
                  </CardPanel>
                  <CardPanel title="MFA">
                    <label className="flex items-center gap-3 text-sm">
                      <input id="mfa" type="checkbox" onChange={async(e)=>{ await litApi.securityMfa(e.target.checked); }} /> Enable MFA
                    </label>
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" onClick={async()=>{ const j = await litApi.securityTokenGenerate(); alert(`Token: ${j?.token || 'generated'}`); }}>Generate API Token</Button>
                      <Button variant="outline" onClick={async()=>{ const id = prompt('Token ID to revoke?') || ''; if (id) await litApi.securityTokenRevoke(id); }}>Revoke Token</Button>
                    </div>
                  </CardPanel>
                </div>
              </TabsContent>

              <TabsContent value="billing" className="mt-6">
                <div className="grid md:grid-cols-2 gap-5">
                  <CardPanel title="Payment Method">
                    <p className="text-sm text-slate-600">Update card on file.</p>
                    <div className="mt-3"><Button onClick={async()=>{ const r = await litApi.billingUpdatePaymentMethod(); alert('If configured, you will be redirected.'); }}>{'Update Payment Method'}</Button></div>
                  </CardPanel>
                  <CardPanel title="Invoices">
                    <div className="text-sm text-slate-600">View your recent invoices.</div>
                    <div className="mt-3"><Button variant="outline" onClick={async()=>{ const j = await litApi.billingInvoices(); alert(`${(j?.items||[]).length} invoices`); }}>Fetch Invoices</Button></div>
                  </CardPanel>
                </div>
              </TabsContent>
            </Tabs>
          </LitPanel>
        </main>
      </div>
    </div>
  );
}
