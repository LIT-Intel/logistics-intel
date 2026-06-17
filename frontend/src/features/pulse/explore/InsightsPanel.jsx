// Insights panel — Pulse Coach chat on top of the current map view.
//
// Behavior
// ─ Shows a one-shot "narrative summary" of the current filter view at
//   the top (instant, local compute — what the old InsightsPanel did).
// ─ Below that, a chat thread: user asks a question about the data,
//   askPulseCoach() answers in markdown. The user's question is sent
//   with a prepended "Context:" block describing the current filter
//   view (top stats + first few sample companies + filter chips) so the
//   coach grounds its reply in what's actually on screen.
// ─ Every assistant turn exposes two action buttons: "Download PDF" and
//   "Email PDF". Download uses jsPDF client-side (already in deps).
//   Email POSTs the same PDF + recipient to the new `email-pulse-report`
//   edge fn (Resend, LIT-branded).
//
// The system prompt baked into pulse-coach-v2 is freight-operator tone
// and vendor-neutral; we don't override it. We just pass enough context
// for it to answer about the rows on screen.

import { useMemo, useState, useRef, useEffect } from 'react';
import { Sparkles, Send, FileDown, Mail, Loader2 } from 'lucide-react';
import { askPulseCoach } from '@/api/pulse';
import { generatePulseReportPdf } from './pulseReportPdf';
import { emailPulseReport } from '@/api/pulse-report-email';
import { toast } from 'sonner';

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtMoneyM(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}B`;
  if (n >= 1) return `$${n.toFixed(1)}M`;
  return `$${(n * 1000).toFixed(0)}k`;
}

// Tiny markdown→HTML pass: bold, italics, line breaks. Coach replies
// are short markdown — no code blocks, no images — so this is enough.
function renderMarkdown(md) {
  if (!md) return null;
  const html = md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-[12px]">$1</code>')
    .replace(/\n- /g, '\n• ')
    .replace(/\n/g, '<br/>');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// Aggregate a per-key count from row entries, return top-N as a
// readable string like "Maersk (42) · Hapag-Lloyd (18) · MSC (9)".
function topN(rows, getter, n = 5) {
  const counts = new Map();
  for (const r of rows) {
    const items = getter(r);
    if (!items) continue;
    const arr = Array.isArray(items) ? items : [items];
    for (const it of arr) {
      const key = typeof it === 'string' ? it : (it?.name ?? it?.lane ?? it?.code ?? null);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, c]) => `${k} (${c})`).join(' · ');
}

// Build the context blurb prepended to every user question. Includes
// every dimension we have in-hand so the coach can answer about
// forwarders, brokers, ports, ZIP codes, HS codes, top carriers, top
// lanes, freshness mix — not just the headline KPIs. Expanded to ~1500
// chars max so the LLM has real grounding for any data question.
function buildContextBlurb({ rows, insights, filters }) {
  const total = rows.length;
  if (!total) return '';
  const totalRev = rows.reduce((a, r) => {
    const v = Number(r.revenue); return Number.isFinite(v) ? a + v : a;
  }, 0);
  const totalTeu = insights?.totalTeu ?? 0;
  const totalShipments = rows.reduce((a, r) => a + (Number(r.shipments) || 0), 0);

  // Active filter readout
  const filterParts = [];
  if (filters?.name) filterParts.push(`name~"${filters.name}"`);
  if (filters?.industry?.length) filterParts.push(`industry=${filters.industry.slice(0, 5).join(',')}`);
  if (filters?.country?.length) filterParts.push(`country=${filters.country.slice(0, 5).join(',')}`);
  if (filters?.geo?.regions?.length) filterParts.push(`regions=${filters.geo.regions.join(',')}`);
  if (filters?.geo?.states?.length) filterParts.push(`states=${filters.geo.states.slice(0, 8).join(',')}`);
  if (filters?.opportunity_types?.length) filterParts.push(`opp=${filters.opportunity_types.join(',')}`);
  if (filters?.size?.teu_min || filters?.size?.teu_max) filterParts.push(`teu=${filters.size.teu_min ?? 0}-${filters.size.teu_max ?? '∞'}`);
  if (filters?.freshness_state?.length) filterParts.push(`freshness=${filters.freshness_state.join(',')}`);

  // Aggregations across every dimension we surface in row data
  const topForwarders = topN(rows, (r) => r.top_forwarders, 5);
  const topLanes = topN(rows, (r) => r.top_dimensions, 5);
  const topCarriers = topN(rows, (r) => r.top_carrier || r.top_carriers, 5);
  const topPortsLoad = topN(rows, (r) => r.top_port_of_loading || r.top_ports_of_loading, 5);
  const topPortsDisch = topN(rows, (r) => r.top_port_of_discharge || r.top_ports_of_discharge, 5);
  const topBrokers = topN(rows, (r) => r.top_customs_broker || r.top_customs_brokers, 5);
  const topHs = topN(rows, (r) => r.top_hs_codes || r.top_hs, 5);
  const topMetros = topN(rows, (r) => r.metro || r.city, 5);
  const topZips = topN(rows, (r) => r.zip || r.postal_code, 5);
  const topVerticals = topN(rows, (r) => r.vertical, 5);

  const freshness = { live: 0, saved: 0, directory: 0 };
  for (const r of rows) {
    const chip = r?.freshness?.chip ?? 'directory';
    if (freshness[chip] != null) freshness[chip]++;
  }

  const top = rows.slice(0, 8).map((r) => r.company_name).filter(Boolean).join(', ');

  return [
    `Context: ${total.toLocaleString()} accounts on the LIT Pulse Explorer map.`,
    `Totals: revenue ${fmtMoneyM(totalRev)} · 12m TEU ${fmtNum(totalTeu)} · 12m shipments ${fmtNum(totalShipments)}.`,
    insights?.topIndustries?.[0] ? `Top industry: ${insights.topIndustries[0].label} (${Math.round(insights.topIndustries[0].pct * 100)}%).` : null,
    insights?.topCountries?.[0] ? `${Math.round(insights.topCountries[0].pct * 100)}% from ${insights.topCountries[0].label}.` : null,
    topVerticals ? `Top verticals: ${topVerticals}.` : null,
    topMetros ? `Top metros: ${topMetros}.` : null,
    topZips ? `Top ZIPs: ${topZips}.` : null,
    topLanes ? `Top lanes (origin→destination): ${topLanes}.` : null,
    topPortsLoad ? `Top ports of loading: ${topPortsLoad}.` : null,
    topPortsDisch ? `Top ports of discharge: ${topPortsDisch}.` : null,
    topCarriers ? `Top carriers: ${topCarriers}.` : null,
    topForwarders ? `Top forwarders: ${topForwarders}.` : null,
    topBrokers ? `Top customs brokers: ${topBrokers}.` : null,
    topHs ? `Top HS codes: ${topHs}.` : null,
    `Data freshness mix: live=${freshness.live} · saved=${freshness.saved} · directory=${freshness.directory}.`,
    filterParts.length ? `Active filters: ${filterParts.join(' · ')}.` : null,
    top ? `Sample accounts: ${top}.` : null,
    'Answer in plain prose grounded in this data. If the user asks about a dimension you do not see above, say so honestly rather than fabricate. Cite specific numbers when relevant.',
  ].filter(Boolean).join(' ');
}

function ReportActions({ entry, rows, filters, summary, requirePdf }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState('');

  function onDownload() {
    // Trial-preview gating: trial users get the upgrade modal instead.
    if (requirePdf && !requirePdf()) return;
    try {
      generatePulseReportPdf({
        title: 'LIT Pulse Explorer Report',
        question: entry.question,
        answerMd: entry.answer,
        rows,
        filters,
        summary,
      });
      toast.success('Report PDF downloaded');
    } catch (err) {
      toast.error(err?.message ?? 'PDF export failed');
    }
  }

  async function onSendEmail(e) {
    e?.preventDefault?.();
    if (requirePdf && !requirePdf()) return;
    if (!email.trim()) {
      toast.error('Enter a recipient email');
      return;
    }
    setSending(true);
    try {
      const pdfBlob = generatePulseReportPdf({
        title: 'LIT Pulse Explorer Report',
        question: entry.question,
        answerMd: entry.answer,
        rows,
        filters,
        summary,
        returnBlob: true,
      });
      const base64 = await blobToBase64(pdfBlob);
      const result = await emailPulseReport({
        recipient: email.trim(),
        subject: `LIT Pulse Report — ${entry.question.slice(0, 80)}`,
        question: entry.question,
        answerMd: entry.answer,
        pdfBase64: base64,
        filename: 'pulse-report.pdf',
      });
      if (!result?.ok) throw new Error(result?.error ?? 'Email failed');
      toast.success(`Report sent to ${email.trim()}`);
      setEmailOpen(false);
      setEmail('');
    } catch (err) {
      toast.error(err?.message ?? 'Email failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1 text-[11px] rounded px-2 py-1 bg-white border border-slate-200 hover:border-cyan-400 hover:text-cyan-700"
        >
          <FileDown size={12} /> Download PDF
        </button>
        <button
          type="button"
          onClick={() => setEmailOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] rounded px-2 py-1 bg-white border border-slate-200 hover:border-cyan-400 hover:text-cyan-700"
        >
          <Mail size={12} /> Email PDF
        </button>
      </div>
      {emailOpen && (
        <form onSubmit={onSendEmail} className="flex gap-1.5">
          <input
            type="email"
            placeholder="recipient@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 text-[12px] rounded border border-slate-300 px-2 py-1 outline-none focus:border-cyan-500"
            required
          />
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-1 text-[11px] rounded px-2 py-1 bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-60"
          >
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const SUGGESTIONS = [
  'Which accounts here look most vulnerable to switch carriers?',
  'Summarize the biggest consolidation opportunities',
  'What patterns stand out across these trade lanes?',
  'Draft an outreach angle for the top 5 highest-scoring accounts',
];

export default function InsightsPanel({ rows, insights, filters, requireCoach, requirePdf }) {
  const [thread, setThread] = useState([]); // [{question, answer, loading}]
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  const summary = useMemo(() => {
    if (!rows.length) return null;
    const total = rows.length;
    const totalRev = rows.reduce((a, r) => {
      const v = Number(r.revenue); return Number.isFinite(v) ? a + v : a;
    }, 0);
    const totalTeu = insights?.totalTeu ?? 0;
    return { total, totalRev, totalTeu, topIndustry: insights?.topIndustries?.[0], topMetro: insights?.topMetros?.[0], topCountry: insights?.topCountries?.[0] };
  }, [rows, insights]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  async function ask(text) {
    const question = (text ?? '').trim();
    if (!question) return;
    // Trial-preview gating — surface upgrade modal before hitting the
    // server. Server-side `pulse_ai` gate is the real boundary.
    if (requireCoach && !requireCoach()) return;
    if (!rows.length) {
      toast.error('Run a search first — the coach needs data to ground its answer.');
      return;
    }
    setInput('');
    setThread((prev) => [...prev, { question, answer: '', loading: true }]);
    const context = buildContextBlurb({ rows, insights, filters });
    const fullQuestion = `${context}\n\nUser question: ${question}`;
    try {
      const resp = await askPulseCoach(fullQuestion);
      const answer = resp?.answer_md || 'No answer returned.';
      setThread((prev) => prev.map((t, i) => i === prev.length - 1 ? { question, answer, loading: false } : t));
    } catch (err) {
      setThread((prev) => prev.map((t, i) => i === prev.length - 1 ? { question, answer: `Error: ${err?.message ?? 'coach failed'}`, loading: false } : t));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b border-slate-200 px-4 py-3 shrink-0">
        <h3 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <Sparkles size={16} className="text-cyan-600" /> Insights · Coach
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Ask anything about the accounts on your map.</p>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {summary && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] text-slate-700 leading-snug">
            <strong>{summary.total.toLocaleString()}</strong> accounts ·{' '}
            <strong>{fmtMoneyM(summary.totalRev)}</strong> revenue ·{' '}
            <strong>{fmtNum(summary.totalTeu)} TEU</strong>
            {summary.topIndustry && <> · top industry <strong>{summary.topIndustry.label}</strong></>}
            {summary.topMetro && <> · heaviest in <strong>{summary.topMetro.label}</strong></>}
          </div>
        )}

        {!thread.length && rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-slate-500">Try one of these:</p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="text-left text-[12px] rounded border border-slate-200 hover:border-cyan-400 hover:bg-cyan-50 px-2.5 py-1.5 text-slate-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {!rows.length && (
          <div className="grid place-items-center h-full text-slate-400 text-sm p-6 text-center">
            <div>
              <Sparkles size={24} className="mx-auto mb-2 text-slate-300" />
              Run a search first — the coach answers based on the accounts on your map.
            </div>
          </div>
        )}

        {thread.map((entry, i) => (
          <div key={i} className="space-y-2">
            <div className="rounded-lg bg-cyan-600 text-white px-3 py-2 text-[13px] leading-snug">
              {entry.question}
            </div>
            <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-[13px] leading-relaxed text-slate-800">
              {entry.loading ? (
                <span className="inline-flex items-center gap-2 text-slate-500"><Loader2 size={14} className="animate-spin" /> Thinking…</span>
              ) : (
                <>
                  {renderMarkdown(entry.answer)}
                  <ReportActions entry={entry} rows={rows} filters={filters} summary={summary} requirePdf={requirePdf} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="border-t border-slate-200 p-3 shrink-0 bg-white"
      >
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="Ask about this data, or request a report…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!rows.length}
            className="flex-1 text-sm rounded border border-slate-300 px-2.5 py-1.5 outline-none focus:border-cyan-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || !rows.length}
            className="inline-flex items-center justify-center rounded bg-cyan-600 text-white px-3 py-1.5 hover:bg-cyan-700 disabled:opacity-50"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
