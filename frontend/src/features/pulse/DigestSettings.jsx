// DigestSettings — compact email-digest preferences pinned to the
// top of the Pulse Library Lists tab. Reads / writes pulse_digest_prefs
// and offers a "Send test now" button so users can preview the email
// before relying on the cron.

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail, MailCheck, Sparkles } from 'lucide-react';
import {
  getDigestPrefs,
  setDigestPrefs,
  sendDigestNow,
} from '@/features/pulse/pulseListsApi';

export default function DigestSettings() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState(null);  // 'enabled' | 'cadence' | null
  const [sendingTest, setSendingTest] = useState(false);
  const [status, setStatus] = useState(null);             // { tone, message }

  async function load() {
    setLoading(true);
    const res = await getDigestPrefs();
    setPrefs(res.ok ? res.prefs : null);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function patch(field, value) {
    if (!prefs) return;
    setSavingField(field);
    setStatus(null);
    const res = await setDigestPrefs({ [field]: value });
    setSavingField(null);
    if (!res.ok) {
      setStatus({ tone: 'error', message: res.message || 'Could not save preference.' });
      return;
    }
    setPrefs((p) => ({ ...p, [field]: value }));
  }

  async function handleSendTest() {
    if (sendingTest) return;
    setSendingTest(true);
    setStatus(null);
    const res = await sendDigestNow();
    setSendingTest(false);
    if (!res.ok) {
      setStatus({ tone: 'error', message: res.message || 'Send failed.' });
      return;
    }
    if (res.status === 'sent') {
      setStatus({ tone: 'success', message: 'Digest sent — check your inbox.' });
      load();
    } else if (res.status === 'no_matches') {
      setStatus({ tone: 'idle', message: 'No new matches in any list yet — nothing to send.' });
    } else if (res.status === 'no_email_on_file') {
      setStatus({ tone: 'error', message: 'No email on file for your account.' });
    } else {
      setStatus({ tone: 'error', message: res.status });
    }
  }

  if (loading || !prefs) {
    return (
      <div className="mx-4 my-3 flex items-center gap-2 rounded-md border border-slate-100 bg-[#FAFBFC] px-3 py-2 text-[11.5px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="font-body">Loading digest preferences…</span>
      </div>
    );
  }

  const enabled = Boolean(prefs.enabled);

  return (
    <div className="mx-4 my-3 rounded-[10px] border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          {enabled ? <MailCheck className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[12.5px] font-bold text-slate-900">
            Email digest of new matches
          </div>
          <div className="font-body text-[11px] text-slate-500">
            {enabled
              ? `Pulse will email you a ${prefs.cadence} summary when auto-refresh finds new matches.`
              : 'Get a daily or weekly email of every new match across your saved lists.'}
          </div>
        </div>

        {/* Cadence dropdown — only meaningful when enabled */}
        <select
          value={prefs.cadence}
          onChange={(e) => patch('cadence', e.target.value)}
          disabled={!enabled || savingField === 'cadence'}
          className="font-body rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-700 outline-none focus:border-blue-300 disabled:opacity-50"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>

        {/* Toggle */}
        <button
          type="button"
          onClick={() => patch('enabled', !enabled)}
          disabled={savingField === 'enabled'}
          className={[
            'font-display inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition disabled:opacity-50',
            enabled
              ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
          ].join(' ')}
        >
          {savingField === 'enabled' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : enabled ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <Mail className="h-3 w-3" />
          )}
          {enabled ? 'On' : 'Turn on'}
        </button>

        {/* Test send — visible when enabled */}
        {enabled ? (
          <button
            type="button"
            onClick={handleSendTest}
            disabled={sendingTest}
            title="Send a digest right now (force=true)"
            className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {sendingTest ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
            Send test
          </button>
        ) : null}
      </div>

      {/* Status / last-sent line */}
      {status ? (
        <div
          className={[
            'mt-2 rounded-md px-2 py-1.5 text-[11px]',
            status.tone === 'success' ? 'bg-green-50 text-green-700'
              : status.tone === 'error' ? 'bg-rose-50 text-rose-700'
              : 'bg-slate-50 text-slate-600',
          ].join(' ')}
        >
          {status.message}
        </div>
      ) : enabled && prefs.last_digest_at ? (
        <div className="mt-2 font-body text-[10.5px] text-slate-400">
          Last digest {formatRelativeAgo(new Date(prefs.last_digest_at).getTime())} —{' '}
          {prefs.last_status === 'sent'
            ? `sent ${prefs.last_matches_count} match${prefs.last_matches_count === 1 ? '' : 'es'} across ${prefs.last_lists_count} list${prefs.last_lists_count === 1 ? '' : 's'}`
            : prefs.last_status || '—'}
        </div>
      ) : null}
    </div>
  );
}

function formatRelativeAgo(ts) {
  if (!ts) return '';
  const ageMs = Date.now() - ts;
  if (ageMs < 60_000) return 'just now';
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  return `${Math.floor(ageMs / 86_400_000)}d ago`;
}
