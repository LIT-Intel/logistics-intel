import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Loader2,
  MailOpen,
  MessageSquare,
  MousePointer,
  RefreshCw,
  Reply,
  Send,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import RepliesTab from '@/pages/campaigns/RepliesTab';

const RANGE_OPTIONS = [
  { id: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'mtd', label: 'This month', ms: null },
  { id: 'all', label: 'All time', ms: null },
];

const EVENT_LABEL = {
  sent: { label: 'Sent', color: '#1d4ed8', bg: '#DBEAFE', Icon: Send },
  opened: { label: 'Opened', color: '#15803d', bg: '#DCFCE7', Icon: MailOpen },
  clicked: { label: 'Clicked', color: '#7c3aed', bg: '#EDE9FE', Icon: MousePointer },
  replied: { label: 'Replied', color: '#b45309', bg: '#FEF3C7', Icon: Reply },
  meeting_booked: { label: 'Meeting', color: '#0f766e', bg: '#CCFBF1', Icon: CalendarClock },
  bounced: { label: 'Bounced', color: '#991b1b', bg: '#FECACA', Icon: AlertTriangle },
  send_failed: { label: 'Failed', color: '#991b1b', bg: '#FECACA', Icon: AlertTriangle },
  suppressed: { label: 'Suppressed', color: '#64748b', bg: '#F1F5F9', Icon: AlertTriangle },
};

function pct(num, denom) {
  if (!denom) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

function rangeStartIso(rangeId) {
  if (rangeId === 'all') return null;
  if (rangeId === 'mtd') {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }
  const opt = RANGE_OPTIONS.find((r) => r.id === rangeId);
  if (!opt?.ms) return null;
  return new Date(Date.now() - opt.ms).toISOString();
}

function fmtAbsolute(date) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtAgo(date) {
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function metricKey(e, { includeStep = true } = {}) {
  const meta = e.metadata || {};
  return [
    e.campaign_id || 'no_campaign',
    meta.recipient_id || meta.recipient_email || e.id,
    includeStep ? (e.campaign_step_id || meta.step_order || '') : '',
  ].join(':');
}

function isReplyEvent(e) {
  return e.event_type === 'replied' || e.status === 'replied';
}

function isMeetingEvent(e) {
  return e.event_type === 'meeting_booked' || e.status === 'meeting_booked';
}

function labelForEvent(e) {
  if (isMeetingEvent(e)) return EVENT_LABEL.meeting_booked;
  if (isReplyEvent(e)) return EVENT_LABEL.replied;
  return EVENT_LABEL[e.event_type] || EVENT_LABEL.sent;
}

export default function CampaignAnalyticsPage() {
  const navigate = useNavigate();
  const { orgId } = useAuth();
  const loadedOnceRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [events, setEvents] = useState([]);
  const [rangeId, setRangeId] = useState('30d');
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [orgUserIds, setOrgUserIds] = useState([]);

  useEffect(() => {
    const id = window.setInterval(() => setRefreshTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!orgId) return;
      if (!loadedOnceRef.current) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const { data: members, error: membersErr } = await supabase
          .from('org_members')
          .select('user_id')
          .eq('org_id', orgId);
        if (membersErr) throw membersErr;

        const userIds = (members || []).map((m) => m.user_id).filter(Boolean);
        if (!cancelled) setOrgUserIds(userIds);

        const startIso = rangeStartIso(rangeId);
        const recPromise = supabase
          .from('lit_campaign_contacts')
          .select('id,campaign_id,email,status,last_sent_at,next_send_at,first_name,last_name,display_name,company_id')
          .eq('org_id', orgId);
        const campPromise = userIds.length
          ? supabase
            .from('lit_campaigns')
            .select('id,name,status,created_at,user_id')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null });
        const eventsPromise = userIds.length
          ? supabase.rpc('lit_org_outreach_events', {
            p_org_id: orgId,
            p_start_at: startIso,
            p_limit: 5000,
          })
          : Promise.resolve({ data: [], error: null });

        const [recRes, campRes, evtRes] = await Promise.all([recPromise, campPromise, eventsPromise]);
        if (cancelled) return;
        if (recRes.error) throw recRes.error;
        if (campRes.error) throw campRes.error;
        if (evtRes.error) throw evtRes.error;

        setRecipients(recRes.data || []);
        setCampaigns(campRes.data || []);
        setEvents(evtRes.data || []);
        setLastLoadedAt(new Date().toISOString());
        loadedOnceRef.current = true;
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load analytics');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [orgId, rangeId, refreshTick]);

  const totals = useMemo(() => {
    const counts = { sent: 0, opened: 0, clicked: 0, replied: 0, meetings: 0, bounced: 0, send_failed: 0, suppressed: 0 };
    const openKeys = new Set();
    const clickKeys = new Set();
    const replyKeys = new Set();
    const meetingKeys = new Set();
    const bounceKeys = new Set();

    for (const e of events) {
      if (e.event_type === 'sent') counts.sent += 1;
      if (e.event_type === 'send_failed') counts.send_failed += 1;
      if (e.event_type === 'suppressed') counts.suppressed += 1;
      if (e.event_type === 'opened') openKeys.add(metricKey(e));
      if (e.event_type === 'clicked') clickKeys.add(metricKey(e));
      if (e.event_type === 'bounced') bounceKeys.add(metricKey(e, { includeStep: false }));
      if (isReplyEvent(e)) replyKeys.add(metricKey(e, { includeStep: false }));
      if (isMeetingEvent(e)) meetingKeys.add(metricKey(e, { includeStep: false }));
    }

    counts.opened = openKeys.size;
    counts.clicked = clickKeys.size;
    counts.replied = replyKeys.size;
    counts.meetings = meetingKeys.size;
    counts.bounced = bounceKeys.size;

    return {
      ...counts,
      failed: counts.send_failed,
      openRate: pct(counts.opened, counts.sent),
      clickRate: pct(counts.clicked, counts.sent),
      replyRate: pct(counts.replied, counts.sent),
      bounceRate: pct(counts.bounced, counts.sent),
      meetingRate: pct(counts.meetings, counts.sent),
      lastEventAt: events[0]?.occurred_at || null,
    };
  }, [events]);

  const perCampaign = useMemo(() => {
    const byId = new Map();

    for (const c of campaigns) {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        status: c.status,
        recipients: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        meetings: 0,
        bounced: 0,
        failed: 0,
        lastEventAt: null,
        byStep: new Map(),
        openKeys: new Set(),
        clickKeys: new Set(),
        replyKeys: new Set(),
        meetingKeys: new Set(),
        bounceKeys: new Set(),
      });
    }

    for (const r of recipients) {
      const row = byId.get(r.campaign_id);
      if (row) row.recipients += 1;
    }

    for (const e of events) {
      const row = byId.get(e.campaign_id);
      if (!row) continue;
      const k = e.event_type;
      if (k === 'sent') row.sent += 1;
      if (k === 'opened') row.openKeys.add(metricKey(e));
      if (k === 'clicked') row.clickKeys.add(metricKey(e));
      if (k === 'bounced') row.bounceKeys.add(metricKey(e, { includeStep: false }));
      if (k === 'send_failed') row.failed += 1;
      if (isReplyEvent(e)) row.replyKeys.add(metricKey(e, { includeStep: false }));
      if (isMeetingEvent(e)) row.meetingKeys.add(metricKey(e, { includeStep: false }));
      if (!row.lastEventAt || new Date(e.occurred_at) > new Date(row.lastEventAt)) row.lastEventAt = e.occurred_at;

      if (e.campaign_step_id) {
        const stepOrder = Number(e.metadata?.step_order ?? 9999);
        const step = row.byStep.get(e.campaign_step_id) || { sent: 0, opened: 0, clicked: 0, replied: 0, order: stepOrder };
        step.order = Math.min(step.order, stepOrder);
        if (k === 'sent') step.sent += 1;
        if (k === 'opened') step.opened += 1;
        if (k === 'clicked') step.clicked += 1;
        if (isReplyEvent(e)) step.replied += 1;
        row.byStep.set(e.campaign_step_id, step);
      }
    }

    return Array.from(byId.values()).map((row) => ({
      ...row,
      opened: row.openKeys.size,
      clicked: row.clickKeys.size,
      replied: row.replyKeys.size,
      meetings: row.meetingKeys.size,
      bounced: row.bounceKeys.size,
    })).sort((a, b) => {
      const ad = a.lastEventAt ? new Date(a.lastEventAt).getTime() : 0;
      const bd = b.lastEventAt ? new Date(b.lastEventAt).getTime() : 0;
      return bd - ad;
    });
  }, [campaigns, recipients, events]);

  const recentEvents = useMemo(() => events.slice(0, 12), [events]);
  const activeCampaigns = perCampaign.filter((c) => c.status === 'active').length;
  const totalRecipients = recipients.length;
  const nextScheduledAt = useMemo(() => {
    const upcoming = recipients
      .map((r) => r.next_send_at)
      .filter((date) => date && new Date(date).getTime() > Date.now())
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return upcoming[0] || null;
  }, [recipients]);
  const isEmpty = !loading && events.length === 0 && totalRecipients === 0;

  return (
    <div className='min-h-full bg-[#F8FAFC]'>
      <div className='mx-auto w-full max-w-[1500px] px-3 py-4 md:px-5 md:py-6'>
        <PageHeader
          activeTab={activeTab}
          lastEventAt={totals.lastEventAt}
          lastLoadedAt={lastLoadedAt}
          navigate={navigate}
          rangeId={rangeId}
          refreshing={refreshing}
          setActiveTab={setActiveTab}
          setRangeId={setRangeId}
          setRefreshTick={setRefreshTick}
        />

        {activeTab === 'replies' ? (
          <section className='rounded-xl border border-slate-200 bg-white'>
            <div className='border-b border-slate-100 px-4 py-3'>
              <div className='text-[12px] font-bold uppercase tracking-wider text-slate-500'>Replies</div>
              <div className='mt-0.5 text-[11px] text-slate-500'>Inbound responses across your campaigns.</div>
            </div>
            <RepliesTab orgUserIds={orgUserIds} />
          </section>
        ) : loading ? (
          <div className='flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16'>
            <Loader2 className='h-5 w-5 animate-spin text-blue-500' />
          </div>
        ) : error ? (
          <div className='flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700'>
            <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
            <div>
              <div className='font-semibold'>Could not load analytics</div>
              <div className='mt-1 font-mono text-[11.5px]'>{error}</div>
            </div>
          </div>
        ) : isEmpty ? (
          <EmptyState onCreate={() => navigate('/app/campaigns/new')} />
        ) : (
          <>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5'>
              <KpiCard label='Sent' value={totals.sent.toLocaleString()} hint={`${totalRecipients} recipient${totalRecipients === 1 ? '' : 's'}`} Icon={Send} tone='#1d4ed8' />
              <KpiCard label='Open rate' value={`${totals.openRate}%`} hint={`${totals.opened} unique opens`} Icon={MailOpen} tone='#15803d' />
              <KpiCard label='Click rate' value={`${totals.clickRate}%`} hint={`${totals.clicked} unique clicks`} Icon={MousePointer} tone='#7c3aed' />
              <KpiCard label='Reply rate' value={`${totals.replyRate}%`} hint={`${totals.replied} replies`} Icon={Reply} tone='#b45309' />
              <KpiCard label='Bounce rate' value={`${totals.bounceRate}%`} hint={`${totals.bounced} bounces`} Icon={AlertTriangle} tone={totals.bounced > 0 ? '#991b1b' : '#64748b'} />
            </div>

            <div className='mt-3 flex flex-wrap items-center gap-2'>
              <Chip>{activeCampaigns} active campaign{activeCampaigns === 1 ? '' : 's'}</Chip>
              <Chip>{perCampaign.length} total</Chip>
              <Chip>{totals.meetings} meeting{totals.meetings === 1 ? '' : 's'} booked</Chip>
              {nextScheduledAt ? <Chip tone='blue'>Next send {fmtAbsolute(nextScheduledAt)}</Chip> : null}
              {totals.failed > 0 ? <Chip tone='rose'>{totals.failed} send failure{totals.failed === 1 ? '' : 's'}</Chip> : null}
              {totals.suppressed > 0 ? <Chip>{totals.suppressed} suppressed</Chip> : null}
            </div>

            <AcquisitionFunnel totals={totals} totalRecipients={totalRecipients} />

            <div className='mt-5 grid gap-4 lg:grid-cols-[280px_1fr]'>
              <RecentActivity events={recentEvents} recipients={recipients} />
              <CampaignTable
                campaigns={perCampaign}
                events={events}
                expanded={expanded}
                navigate={navigate}
                recipients={recipients}
                setExpanded={setExpanded}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PageHeader({ activeTab, lastEventAt, lastLoadedAt, navigate, rangeId, refreshing, setActiveTab, setRangeId, setRefreshTick }) {
  return (
    <>
      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <button type='button' onClick={() => navigate('/app/campaigns')} className='flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50' aria-label='Back to campaigns'>
          <ArrowLeft className='h-3.5 w-3.5' />
        </button>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-[15px] font-bold text-[#0F172A]'>
            <BarChart3 className='h-4 w-4 text-blue-600' />
            Campaign analytics
          </div>
          <div className='text-[11px] text-slate-500'>
            Live workspace analytics. {lastEventAt ? `Last activity ${fmtAgo(lastEventAt)}.` : 'No activity yet in this range.'}
            {lastLoadedAt ? ` Refreshed ${fmtAgo(lastLoadedAt)}.` : ''}
          </div>
        </div>
        <button type='button' onClick={() => setRefreshTick((tick) => tick + 1)} className='inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50'>
          <RefreshCw className={['h-3 w-3', refreshing ? 'animate-spin text-blue-600' : ''].join(' ')} />
          Refresh
        </button>
        <div className='flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5'>
          {RANGE_OPTIONS.map((r) => (
            <button key={r.id} type='button' onClick={() => setRangeId(r.id)} className={['rounded px-2 py-1 text-[11px] font-semibold', rangeId === r.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-700'].join(' ')}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className='mb-4 flex items-center gap-1 border-b border-slate-200'>
        {[{ id: 'overview', label: 'Overview' }, { id: 'replies', label: 'Replies' }].map((t) => (
          <button key={t.id} type='button' onClick={() => setActiveTab(t.id)} className={['-mb-px border-b-2 px-3 py-2 text-[12px] font-semibold transition-colors', activeTab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'].join(' ')} aria-selected={activeTab === t.id} role='tab'>
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}

function AcquisitionFunnel({ totals, totalRecipients }) {
  return (
    <section className='mt-4 rounded-xl border border-slate-200 bg-white p-3'>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <div>
          <div className='text-[12px] font-bold uppercase tracking-wider text-slate-500'>Acquisition funnel</div>
          <div className='text-[11px] text-slate-500'>Recipient movement from campaign volume into conversations and booked meetings.</div>
        </div>
        <div className='hidden items-center gap-1 text-[10.5px] font-semibold text-slate-500 sm:flex'>
          <RefreshCw className='h-3 w-3' />
          Auto-refreshes every 30s
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2 md:grid-cols-5'>
        <FunnelCard label='Recipients' value={totalRecipients} sub='Loaded audience' Icon={MessageSquare} />
        <FunnelCard label='Sent' value={totals.sent} sub={`${pct(totals.sent, totalRecipients)}% of audience`} Icon={Send} />
        <FunnelCard label='Engaged' value={Math.max(totals.opened, totals.clicked)} sub='Opened or clicked' Icon={MailOpen} />
        <FunnelCard label='Replies' value={totals.replied} sub={`${totals.replyRate}% reply rate`} Icon={Reply} />
        <FunnelCard label='Meetings' value={totals.meetings} sub={`${totals.meetingRate}% of sends`} Icon={CalendarClock} />
      </div>
    </section>
  );
}

function RecentActivity({ events, recipients }) {
  return (
    <section className='rounded-xl border border-slate-200 bg-white'>
      <div className='border-b border-slate-100 px-4 py-3'>
        <div className='text-[12px] font-bold uppercase tracking-wider text-slate-500'>Recent activity</div>
      </div>
      <ul className='max-h-[420px] divide-y divide-slate-100 overflow-y-auto'>
        {events.length === 0 ? (
          <li className='px-4 py-6 text-center text-[12px] text-slate-500'>No engagement events in this range.</li>
        ) : events.map((e) => <ActivityItem key={e.id} event={e} recipients={recipients} />)}
      </ul>
    </section>
  );
}

function ActivityItem({ event, recipients }) {
  const meta = labelForEvent(event);
  const Icon = meta.Icon;
  const recipient = event.metadata?.recipient_email
    || recipients.find((r) => r.id === event.metadata?.recipient_id)?.email
    || event.metadata?.recipient_id?.slice(0, 8)
    || '-';
  return (
    <li className='flex items-start gap-2 px-3 py-2'>
      <span className='mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded' style={{ background: meta.bg, color: meta.color }}>
        <Icon className='h-3 w-3' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex items-baseline justify-between gap-2 text-[11.5px]'>
          <span className='truncate font-semibold text-[#0F172A]'>{meta.label}</span>
          <span className='shrink-0 text-[10px] text-slate-400'>{fmtAgo(event.occurred_at)}</span>
        </div>
        <div className='truncate text-[11px] text-slate-500'>{recipient}</div>
        {event.subject ? <div className='truncate text-[10.5px] text-slate-400'>{event.subject}</div> : null}
      </div>
    </li>
  );
}

function CampaignTable({ campaigns, events, expanded, navigate, recipients, setExpanded }) {
  return (
    <section className='rounded-xl border border-slate-200 bg-white'>
      <div className='border-b border-slate-100 px-4 py-3'>
        <div className='text-[12px] font-bold uppercase tracking-wider text-slate-500'>Per campaign</div>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[780px] text-left text-[12px]'>
          <thead className='bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500'>
            <tr>
              <th className='px-3 py-2 font-semibold'></th>
              <th className='px-3 py-2 font-semibold'>Campaign</th>
              <th className='px-3 py-2 font-semibold'>Status</th>
              <th className='px-2 py-2 text-right font-semibold'>Recip</th>
              <th className='px-2 py-2 text-right font-semibold'>Sent</th>
              <th className='px-2 py-2 text-right font-semibold'>Open%</th>
              <th className='px-2 py-2 text-right font-semibold'>Click%</th>
              <th className='px-2 py-2 text-right font-semibold'>Reply%</th>
              <th className='px-2 py-2 text-right font-semibold'>Meetings</th>
              <th className='px-2 py-2 text-right font-semibold'>Bounce%</th>
              <th className='px-2 py-2 text-right font-semibold'>Last</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr><td colSpan={11} className='px-4 py-6 text-center text-slate-500'>No campaigns yet.</td></tr>
            ) : campaigns.map((c) => (
              <React.Fragment key={c.id}>
                <tr className='cursor-pointer border-t border-slate-100 hover:bg-slate-50' onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <td className='px-3 py-2 align-top text-slate-400'>{expanded === c.id ? <ChevronDown className='h-3 w-3' /> : <ChevronRight className='h-3 w-3' />}</td>
                  <td className='px-3 py-2 font-semibold text-[#0F172A]'>{c.name}</td>
                  <td className='px-3 py-2 text-slate-600'>{c.status}</td>
                  <td className='px-2 py-2 text-right tabular-nums text-slate-700'>{c.recipients}</td>
                  <td className='px-2 py-2 text-right tabular-nums font-semibold text-blue-700'>{c.sent}</td>
                  <td className='px-2 py-2 text-right tabular-nums text-emerald-700'>{pct(c.opened, c.sent)}%</td>
                  <td className='px-2 py-2 text-right tabular-nums text-violet-700'>{pct(c.clicked, c.sent)}%</td>
                  <td className='px-2 py-2 text-right tabular-nums text-amber-700'>{pct(c.replied, c.sent)}%</td>
                  <td className='px-2 py-2 text-right tabular-nums text-teal-700'>{c.meetings}</td>
                  <td className='px-2 py-2 text-right tabular-nums text-rose-700'>{pct(c.bounced, c.sent)}%</td>
                  <td className='px-2 py-2 text-right tabular-nums text-[10px] text-slate-500'>{c.lastEventAt ? fmtAgo(c.lastEventAt) : '-'}</td>
                </tr>
                {expanded === c.id ? (
                  <tr className='bg-slate-50/60'>
                    <td colSpan={11} className='px-4 py-3'>
                      <CampaignDetail campaign={c} events={events.filter((e) => e.campaign_id === c.id)} navigate={navigate} recipients={recipients} />
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KpiCard({ label, value, hint, Icon, tone }) {
  return (
    <div className='rounded-xl border border-slate-200 bg-white p-3.5'>
      <div className='flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500'>
        <Icon className='h-3 w-3' style={{ color: tone }} />
        {label}
      </div>
      <div className='mt-1.5 text-[20px] font-bold leading-none' style={{ color: tone }}>{value}</div>
      <div className='mt-1 text-[10.5px] text-slate-500'>{hint}</div>
    </div>
  );
}

function FunnelCard({ label, value, sub, Icon }) {
  return (
    <div className='rounded-lg border border-slate-200 bg-slate-50/70 p-3'>
      <div className='flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500'>
        <Icon className='h-3 w-3 text-blue-600' />
        {label}
      </div>
      <div className='mt-1.5 text-[18px] font-bold leading-none text-[#0F172A]'>{Number(value || 0).toLocaleString()}</div>
      <div className='mt-1 text-[10.5px] text-slate-500'>{sub}</div>
    </div>
  );
}

function Chip({ children, tone = 'slate' }) {
  const map = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${map[tone] || map.slate}`}>{children}</span>;
}

function CampaignDetail({ campaign, events, navigate, recipients }) {
  const recent = events.slice(0, 8);
  const stepCounts = Array.from(campaign.byStep.entries()).sort((a, b) => a[1].order - b[1].order);
  return (
    <div className='grid gap-3 md:grid-cols-2'>
      <div>
        <div className='mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500'>Per-step funnel</div>
        {stepCounts.length === 0 ? (
          <div className='text-[11px] text-slate-500'>No engagement events yet.</div>
        ) : (
          <ul className='space-y-1'>
            {stepCounts.map(([stepId, c], i) => (
              <li key={stepId} className='flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]'>
                <span className='font-mono text-[10px] text-slate-400'>Step {Number.isFinite(c.order) && c.order !== 9999 ? c.order + 1 : i + 1}</span>
                <span className='ml-auto inline-flex gap-2 tabular-nums'>
                  <span className='text-blue-700'>{c.sent}s</span>
                  <span className='text-emerald-700'>{c.opened}o</span>
                  <span className='text-violet-700'>{c.clicked}c</span>
                  <span className='text-amber-700'>{c.replied}r</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type='button' onClick={() => navigate(`/app/campaigns/new?edit=${encodeURIComponent(campaign.id)}`)} className='mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50'>
          Open campaign
        </button>
      </div>
      <div>
        <div className='mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500'>Recent events</div>
        {recent.length === 0 ? <div className='text-[11px] text-slate-500'>No events.</div> : (
          <ul className='space-y-1'>
            {recent.map((e) => <DetailEvent key={e.id} event={e} recipients={recipients} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function DetailEvent({ event, recipients }) {
  const meta = labelForEvent(event);
  const Icon = meta.Icon;
  const recipient = event.metadata?.recipient_email
    || recipients.find((r) => r.id === event.metadata?.recipient_id)?.email
    || event.metadata?.recipient_id?.slice(0, 8)
    || '-';
  return (
    <li className='flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px]'>
      <span className='mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded' style={{ background: meta.bg, color: meta.color }}>
        <Icon className='h-2.5 w-2.5' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex items-baseline justify-between gap-2'>
          <span className='font-semibold text-[#0F172A]'>{meta.label}</span>
          <span className='text-[9.5px] text-slate-400'>{fmtAbsolute(event.occurred_at)}</span>
        </div>
        <div className='truncate text-[10.5px] text-slate-500'>{recipient}</div>
      </div>
    </li>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className='flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center'>
      <div className='flex h-12 w-12 items-center justify-center rounded-full bg-blue-50'>
        <BarChart3 className='h-5 w-5 text-blue-600' />
      </div>
      <div className='mt-3 text-[14px] font-bold text-[#0F172A]'>No campaign activity yet</div>
      <p className='mt-1 max-w-md text-[12.5px] text-slate-500'>
        Once a campaign launches and recipients are queued, this dashboard fills with live send, open, click, reply and booked-meeting numbers from the outreach history log.
      </p>
      <button type='button' onClick={onCreate} className='mt-4 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm'>
        Create your first campaign
      </button>
    </div>
  );
}
