'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import {
  type AudienceContact,
  type CampaignDraft,
  type CampaignMetrics,
  type CampaignSummary,
  type CampaignTemplate,
  type SequenceStep,
} from '@/components/campaigns/types';
import { CampaignList } from '@/components/campaigns/CampaignList';
import { CampaignEditor } from '@/components/campaigns/CampaignEditor';
import { SequenceBuilder } from '@/components/campaigns/SequenceBuilder';
import { StatsRibbon } from '@/components/campaigns/StatsRibbon';
import { TemplatePicker } from '@/components/campaigns/TemplatePicker';

const DEFAULT_METRICS: CampaignMetrics = {
  enrolled: 0,
  sent: 0,
  delivered: 0,
  opens: 0,
  replies: 0,
  bounces: 0,
};

const STORAGE_KEY = 'lit.campaigns.local';

const MOCK_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'tpl_prospect_warm',
    name: 'Warm Intro — Value Hook',
    category: 'Prospecting',
    subject: 'Quick idea for {{company}}\'s logistics ops',
    body: `Hi {{first_name}},

We help brands like {{company}} cut landed costs by 8–12% while improving on-time arrivals.

Worth a 10 minute walkthrough?

— Valesco`,
    description: 'Short intro focused on value prop and quick CTA.',
  },
  {
    id: 'tpl_prospect_metrics',
    name: 'Playbook w/ Metrics',
    category: 'Prospecting',
    subject: 'How {{company}} can unlock +12% landed cost savings',
    body: `Hey {{first_name}},

Our Command Center surfaces hidden fees and lane-level overruns. Teams similar to {{company}} saw:
• 12% landed cost reduction
• 2.4 day faster exception resolution

Open to trading notes this week?

Best,
Valesco`,
    description: 'Metric-driven opener referencing Command Center.',
  },
  {
    id: 'tpl_followup_light',
    name: 'Follow-up — Soft Nudge',
    category: 'Follow-up',
    subject: 'Re: quick idea for {{company}}',
    body: `Hi {{first_name}},

Circling back in case the timing was better this week. Happy to send the 1‑pager we use for RFP pilots.

— Valesco`,
  },
  {
    id: 'tpl_followup_case',
    name: 'Follow-up — Case Study',
    category: 'Follow-up',
    subject: '{{company}} x RFP wins we can share?',
    body: `Hi {{first_name}},

We just wrapped an RFP for a lifestyle brand with 38 lanes. They trimmed freight by 9% across ocean + air.

Should I loop you into the recap deck?

Thanks!
Valesco`,
  },
  {
    id: 'tpl_breakup_short',
    name: 'Breakup — Short',
    category: 'Breakup',
    subject: 'Should I close the loop?',
    body: `Hi {{first_name}},

No worries if this isn’t a fit. Happy to close the loop — or send our lane benchmarking if useful later.

— Valesco`,
  },
  {
    id: 'tpl_breakup_value',
    name: 'Breakup — Value Reminder',
    category: 'Breakup',
    subject: 'Before I close this out…',
    body: `{{first_name}},

Before I close this out — Command Center keeps your shipment search, RFP workspace, and quote exports in one place.

Should I keep you posted when the PDF builder ships?

Appreciate the time either way.
Valesco`,
  },
];

const MOCK_AUDIENCE: AudienceContact[] = [
  { id: 'aud_1', name: 'Alex Patterson', title: 'Director of Logistics', company: 'Aurora Supply Co.', email: 'alex@aurorasupply.com', status: 'Engaged' },
  { id: 'aud_2', name: 'Jamie Rivera', title: 'VP, Procurement', company: 'Aurora Supply Co.', email: 'jamie@aurorasupply.com', status: 'Replied' },
  { id: 'aud_3', name: 'Samir Dewan', title: 'Ops Manager', company: 'Aurora Supply Co.', email: 'samir@aurorasupply.com', status: 'Opened' },
  { id: 'aud_4', name: 'Morgan Lee', title: 'Warehouse Lead', company: 'Aurora Supply Co.', email: 'morgan@aurorasupply.com', status: 'Queued' },
  { id: 'aud_5', name: 'Priya Venkataraman', title: 'Global Logistics', company: 'Aurora Supply Co.', email: 'priya@aurorasupply.com', status: 'Queued' },
];

type ActivityItem = {
  id: string;
  timestamp: string;
  actor: string;
  event: string;
};

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: 'act_1', timestamp: '10:14 AM', actor: 'Alex P.', event: 'Opened Email — Intro Email' },
  { id: 'act_2', timestamp: '09:57 AM', actor: 'Jamie R.', event: 'Replied — Nudge Email' },
  { id: 'act_3', timestamp: 'Yesterday', actor: 'Samir D.', event: 'LinkedIn connection accepted' },
];

const MOCK_CAMPAIGNS: CampaignSummary[] = [
  {
    id: 'cmp_001',
    name: 'Prospecting — Fitness Brands',
    status: 'paused',
    updatedAt: 'Nov 10',
    stats: {
      enrolled: 248,
      sent: 712,
      delivered: 690,
      opens: 412,
      replies: 36,
      bounces: 7,
    },
  },
  {
    id: 'cmp_002',
    name: 'Renewals Q4',
    status: 'running',
    updatedAt: 'Nov 09',
    stats: {
      enrolled: 83,
      sent: 221,
      delivered: 210,
      opens: 120,
      replies: 18,
      bounces: 2,
    },
  },
  {
    id: 'cmp_003',
    name: 'Dormant — Warehousing Leads',
    status: 'draft',
    updatedAt: 'Nov 03',
    stats: {
      enrolled: 0,
      sent: 0,
      delivered: 0,
      opens: 0,
      replies: 0,
      bounces: 0,
    },
  },
];

function createDefaultSteps(): SequenceStep[] {
  return [
    {
      id: `s_${Math.random().toString(36).slice(2, 7)}`,
      type: 'email',
      title: 'Intro Email',
      waitDays: 0,
      template: {
        subject: 'Quick idea for {{company}}',
        body: `Hi {{first_name}},\n\nWe help brands like {{company}} reduce landed costs by 8–12%. Worth a 10‑minute walkthrough?\n\n— Valesco`,
      },
    },
    {
      id: `s_${Math.random().toString(36).slice(2, 7)}`,
      type: 'wait',
      title: 'Wait 2 days',
      waitDays: 2,
    },
    {
      id: `s_${Math.random().toString(36).slice(2, 7)}`,
      type: 'linkedin',
      title: 'LinkedIn — Connect',
      waitDays: 0,
      action: 'connect',
      message: 'Hi {{first_name}}, love what {{company}} is building. Would value connecting.',
    },
    {
      id: `s_${Math.random().toString(36).slice(2, 7)}`,
      type: 'email',
      title: 'Nudge Email',
      waitDays: 3,
      template: {
        subject: 'Re: ops idea for {{company}}',
        body: `Hi {{first_name}} — circling back in case this slipped. Happy to share a 1‑pager.\n\n— Valesco`,
      },
    },
  ];
}

function createDraft(summary?: CampaignSummary): CampaignDraft {
  const stats = summary?.stats ?? DEFAULT_METRICS;
  return {
    id: summary?.id ?? `cmp_${Math.random().toString(36).slice(2, 6)}`,
    name: summary?.name ?? 'New Campaign',
    status: summary?.status ?? 'draft',
    subject: 'Quick idea for {{company}}',
    fromName: 'Valesco Raymond',
    fromEmail: 'valesco@sparkfusiondigital.com',
    replyTo: '',
    signature: 'Best,\nValesco Raymond\nSpark Fusion Digital',
    body: `Hi {{first_name}},\n\nWe help brands like {{company}} reduce landed costs by 8–12%. Worth a 10‑minute walkthrough?\n\n— Valesco`,
    metrics: {
      enrolled: stats.enrolled ?? 0,
      sent: stats.sent ?? 0,
      delivered: stats.delivered ?? stats.sent ?? 0,
      opens: stats.opens ?? 0,
      replies: stats.replies ?? 0,
      bounces: stats.bounces ?? 0,
    },
    updatedAt: summary?.updatedAt ?? 'Today',
    steps: createDefaultSteps(),
  };
}

function mapDbCampaign(row: any): { summary: CampaignSummary; draft: CampaignDraft } {
  const metrics = row?.metrics ?? {};
  const savedDraft = metrics?.draft ?? {};
  const stats = {
    enrolled: Number(metrics?.enrolled ?? metrics?.stats?.enrolled ?? 0),
    sent: Number(metrics?.sent ?? metrics?.stats?.sent ?? 0),
    delivered: Number(metrics?.delivered ?? metrics?.stats?.delivered ?? metrics?.stats?.sent ?? 0),
    opens: Number(metrics?.opens ?? metrics?.stats?.opens ?? 0),
    replies: Number(metrics?.replies ?? metrics?.stats?.replies ?? 0),
    bounces: Number(metrics?.bounces ?? metrics?.stats?.bounces ?? 0),
  };

  const summary: CampaignSummary = {
    id: String(row.id),
    name: row.name ?? savedDraft.name ?? 'Untitled Campaign',
    status: row.status ?? savedDraft.status ?? 'draft',
    updatedAt: row.created_at
      ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
      : 'Today',
    stats,
  };

  const draft: CampaignDraft = {
    ...createDraft(summary),
    id: String(row.id),
    name: row.name ?? savedDraft.name ?? 'Untitled Campaign',
    status: row.status ?? savedDraft.status ?? 'draft',
    subject: savedDraft.subject ?? 'Quick idea for {{company}}',
    fromName: savedDraft.fromName ?? 'Valesco Raymond',
    fromEmail: savedDraft.fromEmail ?? 'valesco@sparkfusiondigital.com',
    replyTo: savedDraft.replyTo ?? '',
    signature: savedDraft.signature ?? 'Best,\nValesco Raymond\nSpark Fusion Digital',
    body: savedDraft.body ?? `Hi {{first_name}},\n\nWe help brands like {{company}} reduce landed costs by 8–12%. Worth a 10‑minute walkthrough?\n\n— Valesco`,
    metrics: stats,
    updatedAt: summary.updatedAt,
    steps: Array.isArray(savedDraft.steps) && savedDraft.steps.length ? savedDraft.steps : createDefaultSteps(),
  };

  return { summary, draft };
}

function readLocalCampaigns(): { summary: CampaignSummary; draft: CampaignDraft }[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.summary?.id && item?.draft?.id);
  } catch {
    return [];
  }
}

function writeLocalCampaigns(items: { summary: CampaignSummary; draft: CampaignDraft }[]) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore local cache write failures
  }
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CampaignDraft>>({});
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('builder');
  const [stepTemplateTarget, setStepTemplateTarget] = useState<SequenceStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataMode, setDataMode] = useState<'live' | 'local' | 'demo'>('demo');
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function loadCampaigns() {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id ?? null;

        let query = supabase
          .from('lit_campaigns')
          .select('id, user_id, name, status, channel, metrics, created_at')
          .order('created_at', { ascending: false });

        if (userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        if (rows.length) {
          const mapped = rows.map(mapDbCampaign);
          if (cancelled) return;
          setCampaigns(mapped.map((item) => item.summary));
          setDrafts(Object.fromEntries(mapped.map((item) => [item.summary.id, item.draft])));
          setSelectedCampaignId(mapped[0]?.summary.id ?? null);
          setSelectedStepId(mapped[0]?.draft.steps[0]?.id ?? null);
          setDataMode('live');
          writeLocalCampaigns(mapped);
          return;
        }

        const local = readLocalCampaigns();
        if (local.length) {
          if (cancelled) return;
          setCampaigns(local.map((item) => item.summary));
          setDrafts(Object.fromEntries(local.map((item) => [item.summary.id, item.draft])));
          setSelectedCampaignId(local[0]?.summary.id ?? null);
          setSelectedStepId(local[0]?.draft.steps[0]?.id ?? null);
          setDataMode('local');
          return;
        }

        const demoDrafts = Object.fromEntries(MOCK_CAMPAIGNS.map((summary) => [summary.id, createDraft(summary)]));
        if (!cancelled) {
          setCampaigns(MOCK_CAMPAIGNS);
          setDrafts(demoDrafts);
          setSelectedCampaignId(MOCK_CAMPAIGNS[0]?.id ?? null);
          setSelectedStepId(demoDrafts[MOCK_CAMPAIGNS[0]?.id ?? '']?.steps[0]?.id ?? null);
          setDataMode('demo');
        }
      } catch (error) {
        console.warn('[campaigns] load failed, using local/demo fallback', error);
        const local = readLocalCampaigns();
        if (!cancelled && local.length) {
          setCampaigns(local.map((item) => item.summary));
          setDrafts(Object.fromEntries(local.map((item) => [item.summary.id, item.draft])));
          setSelectedCampaignId(local[0]?.summary.id ?? null);
          setSelectedStepId(local[0]?.draft.steps[0]?.id ?? null);
          setDataMode('local');
        } else if (!cancelled) {
          const demoDrafts = Object.fromEntries(MOCK_CAMPAIGNS.map((summary) => [summary.id, createDraft(summary)]));
          setCampaigns(MOCK_CAMPAIGNS);
          setDrafts(demoDrafts);
          setSelectedCampaignId(MOCK_CAMPAIGNS[0]?.id ?? null);
          setSelectedStepId(demoDrafts[MOCK_CAMPAIGNS[0]?.id ?? '']?.steps[0]?.id ?? null);
          setDataMode('demo');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCampaigns();

    return () => {
      cancelled = true;
    };
  }, []);

  const draft = selectedCampaignId ? drafts[selectedCampaignId] : null;
  const metrics = draft?.metrics ?? DEFAULT_METRICS;

  const persistLocalSnapshot = (nextCampaigns: CampaignSummary[], nextDrafts: Record<string, CampaignDraft>) => {
    const items = nextCampaigns
      .map((summary) => {
        const nextDraft = nextDrafts[summary.id];
        if (!nextDraft) return null;
        return { summary, draft: nextDraft };
      })
      .filter(Boolean) as { summary: CampaignSummary; draft: CampaignDraft }[];

    writeLocalCampaigns(items);
  };

  const handleCreateCampaign = () => {
    const id = `cmp_${Date.now().toString(36)}`;
    const summary: CampaignSummary = {
      id,
      name: 'New Campaign',
      status: 'draft',
      updatedAt: 'Today',
      stats: { ...DEFAULT_METRICS },
    };
    const newDraft = createDraft(summary);
    const nextCampaigns = [summary, ...campaigns];
    const nextDrafts = { ...drafts, [id]: newDraft };
    setCampaigns(nextCampaigns);
    setDrafts(nextDrafts);
    persistLocalSnapshot(nextCampaigns, nextDrafts);
    setSelectedCampaignId(id);
    setSelectedStepId(newDraft.steps[0]?.id ?? null);
    setActiveTab('builder');
    setDataMode((prev) => (prev === 'live' ? prev : 'local'));
  };

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaignId(id);
    const existing = drafts[id];
    if (existing) {
      setSelectedStepId(existing.steps[0]?.id ?? null);
      return;
    }

    const summary = campaigns.find((c) => c.id === id);
    const nextDraft = createDraft(summary);
    const nextDrafts = { ...drafts, [id]: nextDraft };
    setDrafts(nextDrafts);
    persistLocalSnapshot(campaigns, nextDrafts);
    setSelectedStepId(nextDraft.steps[0]?.id ?? null);
  };

  const handleDraftChange = (nextDraft: CampaignDraft) => {
    if (!selectedCampaignId) return;
    const nextDrafts = { ...drafts, [selectedCampaignId]: nextDraft };
    setDrafts(nextDrafts);
    persistLocalSnapshot(campaigns, nextDrafts);
  };

  const handleSaveDraft = async (nextDraft: CampaignDraft) => {
    if (!nextDraft?.id) return;

    const updatedSummary: CampaignSummary = {
      id: nextDraft.id,
      name: nextDraft.name || 'New Campaign',
      status: nextDraft.status || 'draft',
      updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
      stats: { ...DEFAULT_METRICS, ...nextDraft.metrics },
    };

    const nextCampaigns = campaigns.some((campaign) => campaign.id === nextDraft.id)
      ? campaigns.map((campaign) => (campaign.id === nextDraft.id ? updatedSummary : campaign))
      : [updatedSummary, ...campaigns];

    const nextDrafts = { ...drafts, [nextDraft.id]: nextDraft };

    setCampaigns(nextCampaigns);
    setDrafts(nextDrafts);
    persistLocalSnapshot(nextCampaigns, nextDrafts);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;

      const payload = {
        id: nextDraft.id,
        user_id: userId,
        name: nextDraft.name || 'New Campaign',
        status: nextDraft.status || 'draft',
        channel: 'email',
        metrics: {
          enrolled: nextDraft.metrics?.enrolled ?? 0,
          sent: nextDraft.metrics?.sent ?? 0,
          delivered: nextDraft.metrics?.delivered ?? 0,
          opens: nextDraft.metrics?.opens ?? 0,
          replies: nextDraft.metrics?.replies ?? 0,
          bounces: nextDraft.metrics?.bounces ?? 0,
          draft: {
            name: nextDraft.name,
            status: nextDraft.status,
            subject: nextDraft.subject,
            fromName: nextDraft.fromName,
            fromEmail: nextDraft.fromEmail,
            replyTo: nextDraft.replyTo,
            signature: nextDraft.signature,
            body: nextDraft.body,
            steps: nextDraft.steps,
          },
        },
      };

      const { error } = await supabase
        .from('lit_campaigns')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      setDataMode('live');
      toast({
        title: 'Campaign saved',
        description: `${payload.name} was saved successfully.`,
      });
    } catch (error) {
      console.error('Failed to save campaign:', error);
      toast({
        title: 'Saved locally only',
        description: 'The draft was stored in your browser, but the Supabase save failed.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleTestSent = (result: { messageId: string; to: string }) => {
    if (!selectedCampaignId) return;
    setDrafts((prev) => {
      const current = prev[selectedCampaignId];
      if (!current) return prev;
      const nextMetrics = {
        ...current.metrics,
        sent: current.metrics.sent + 1,
        delivered: current.metrics.delivered + 1,
      };
      const nextDraft = { ...current, metrics: nextMetrics };
      const nextDrafts = { ...prev, [selectedCampaignId]: nextDraft };
      persistLocalSnapshot(
        campaigns.map((campaign) =>
          campaign.id === selectedCampaignId
            ? { ...campaign, stats: { ...campaign.stats, sent: nextMetrics.sent, delivered: nextMetrics.delivered } }
            : campaign
        ),
        nextDrafts
      );
      return nextDrafts;
    });
    setCampaigns((prev) =>
      prev.map((campaign) =>
        campaign.id === selectedCampaignId
          ? {
              ...campaign,
              stats: {
                ...campaign.stats,
                sent: campaign.stats.sent + 1,
                delivered: campaign.stats.delivered + 1,
              },
            }
          : campaign
      )
    );
    toast({
      title: 'Test email sent',
      description: `Mock delivery queued to ${result.to}.`,
    });
  };

  const handleUpdateStep = (step: SequenceStep) => {
    if (!selectedCampaignId) return;
    const current = drafts[selectedCampaignId];
    if (!current) return;
    const steps = current.steps.map((existing) => (existing.id === step.id ? step : existing));
    const nextDrafts = { ...drafts, [selectedCampaignId]: { ...current, steps } };
    setDrafts(nextDrafts);
    persistLocalSnapshot(campaigns, nextDrafts);
  };

  const handleAddStep = () => {
    if (!selectedCampaignId) return;
    const newStep: SequenceStep = {
      id: `s_${Date.now().toString(36).slice(2, 7)}`,
      type: 'email',
      title: 'New Email',
      waitDays: 2,
      template: {
        subject: 'Following up with {{company}}',
        body: `Hi {{first_name}},\n\nSharing a quick follow-up in case this is still on your radar.\n\nBest,\nValesco`,
      },
    };
    const current = drafts[selectedCampaignId];
    if (!current) return;
    const nextDrafts = {
      ...drafts,
      [selectedCampaignId]: { ...current, steps: [...current.steps, newStep] },
    };
    setDrafts(nextDrafts);
    persistLocalSnapshot(campaigns, nextDrafts);
    setSelectedStepId(newStep.id);
  };

  const handleApplyTemplateToEmail = (template: CampaignTemplate) => {
    if (!selectedCampaignId) return;
    const current = drafts[selectedCampaignId];
    if (!current) return;
    const nextDraft = { ...current, subject: template.subject, body: template.body };
    const nextDrafts = { ...drafts, [selectedCampaignId]: nextDraft };
    setDrafts(nextDrafts);
    persistLocalSnapshot(campaigns, nextDrafts);
    toast({
      title: 'Template applied',
      description: `${template.name} inserted into the composer.`,
    });
  };

  const fromOptions = useMemo(
    () => ['valesco@sparkfusiondigital.com', 'sales@sparkfusiondigital.com', 'rfp@logisticsintel.app'],
    []
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-slate-50 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500">
            Build multi-step outreach across Email and LinkedIn. Track opens, replies, and outcomes.
          </p>
        </div>
        <Badge className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
          {dataMode === 'live' ? 'Live Supabase data' : dataMode === 'local' ? 'Local draft cache' : 'Demo seed data'}
        </Badge>
      </div>

      <StatsRibbon metrics={metrics} className="mb-6" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <CampaignList
            items={campaigns}
            selectedId={selectedCampaignId}
            onSelect={handleSelectCampaign}
            onCreate={handleCreateCampaign}
          />
        </div>

        <div className="lg:col-span-3">
          <Card className="mb-4 rounded-3xl border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="flex w-full flex-wrap gap-2 rounded-full bg-slate-100 p-1">
                  {['builder', 'audience', 'templates', 'preview', 'activity'].map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="flex-1 rounded-full text-sm capitalize data-[state=active]:bg-white data-[state=active]:text-slate-900"
                    >
                      {tab}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="builder" className="pt-4">
                  {draft ? (
                    <div className="space-y-4">
                      <CampaignEditor
                        draft={draft}
                        onDraftChange={handleDraftChange}
                        templates={MOCK_TEMPLATES}
                        fromOptions={fromOptions}
                        onSave={handleSaveDraft}
                        onTestSent={handleTestSent}
                      />
                      <Card className="rounded-3xl border-slate-200">
                        <CardHeader>
                          <CardTitle className="text-sm font-semibold text-slate-800">Sequence builder</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <SequenceBuilder
                            steps={draft.steps}
                            selectedId={selectedStepId}
                            onSelect={(step) => setSelectedStepId(step.id)}
                            onUpdateStep={handleUpdateStep}
                            onAddStep={handleAddStep}
                            onPickTemplate={(step) => setStepTemplateTarget(step)}
                          />
                        </CardContent>
                      </Card>
                    </div>
                  ) : loading ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      Loading campaigns…
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      Create a campaign to get started.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="audience" className="pt-4">
                  <Card className="rounded-3xl border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-sm font-semibold text-slate-800">Audience preview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {MOCK_AUDIENCE.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                        >
                          <div>
                            <div className="font-medium text-slate-800">{contact.name}</div>
                            <div className="text-xs text-slate-500">
                              {contact.title} • {contact.company}
                            </div>
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <div>{contact.email}</div>
                            <Badge className="mt-1 rounded-full bg-slate-100 text-slate-600">{contact.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="templates" className="pt-4">
                  <Card className="rounded-3xl border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-sm font-semibold text-slate-800">Template library</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TemplatePicker templates={MOCK_TEMPLATES} onSelect={handleApplyTemplateToEmail} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="preview" className="pt-4">
                  {draft ? (
                    <Card className="rounded-3xl border-slate-200 bg-slate-50/60">
                      <CardHeader>
                        <CardTitle className="text-sm font-semibold text-slate-800">Live preview</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm text-slate-700">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500">Subject</div>
                          <div className="mt-1 text-base font-semibold text-slate-800">{draft.subject}</div>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Body</div>
                          <div className="mt-2 whitespace-pre-line leading-relaxed">{draft.body}</div>
                          <div className="mt-4 whitespace-pre-line text-slate-600">{draft.signature}</div>
                        </div>
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                          Preview renders tokens using mock data so you can see how contacts will see it.
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      Select a campaign to preview.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="pt-4">
                  <Card className="rounded-3xl border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-sm font-semibold text-slate-800">Recent activity</CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y divide-slate-100 text-sm text-slate-600">
                      {MOCK_ACTIVITY.map((item) => (
                        <div key={item.id} className="flex items-center justify-between py-3">
                          <div className="text-xs text-slate-500">{item.timestamp}</div>
                          <div className="flex-1 px-4">{item.event}</div>
                          <div className="text-slate-700">{item.actor}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(stepTemplateTarget)}
        onOpenChange={(open) => {
          if (!open) setStepTemplateTarget(null);
        }}
      >
        <DialogContent className="max-w-3xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>Choose a template for {stepTemplateTarget?.title ?? 'this step'}</DialogTitle>
          </DialogHeader>
          <TemplatePicker
            templates={MOCK_TEMPLATES}
            onSelect={(template) => {
              if (!stepTemplateTarget) return;
              const updated: SequenceStep = {
                ...stepTemplateTarget,
                title: stepTemplateTarget.title || template.name,
                template: { subject: template.subject, body: template.body },
              };
              handleUpdateStep(updated);
              setStepTemplateTarget(null);
              toast({
                title: 'Step template assigned',
                description: `${template.name} applied to ${updated.title}.`,
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
