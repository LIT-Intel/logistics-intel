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

// Build the context blurb prepended to every user question. Capped at
// ~600 chars so the coach prompt stays focused.
function buildContextBlurb({ rows, insights, filters }) {
  const total = rows.length;
  if (!total) return '';
  const totalRev = rows.reduce((a, r) => {
    const v = Number(r.revenue); return Number.isFinite(v) ? a + v : a;
  }, 0);
  const totalTeu = insights?.totalTeu ?? 0;
  const filterParts = [];
  if (filters?.industry?.length) filterParts.push(`industry=${filters.industry.slice(0, 3).join(',')}`);
  if (filters?.country?.length) filterParts.push(`country=${filters.country.slice(0, 3).join(',')}`);
  if (filters?.region) filterParts.push(`region=${filters.region}`);
  if (filters?.state?.length) filterParts.push(`state=${filters.state.slice(0, 3).join(',')}`);
  if (filters?.opportunity_type?.length) filterParts.push(`opp=${filters.opportunity_type.join(',')}`);
  if (filters?.teu_min || filters?.teu_max) filterParts.push(`teu=${filters.teu_min ?? 0}-${filters.teu_max ?? '∞'}`);
  const top = rows.slice(0, 5).map((r) => r.company_name).filter(Boolean).join(', ');
  return [
    `Context: user is exploring ${total.toLocaleString()} accounts on the LIT Pulse Explorer map.`,
    `Combined annual revenue ${fmtMoneyM(totalRev)}; combined 12-month TEU ${fmtNum(totalTeu)}.`,
    insights?.topIndustries?.[0] ? `Top industry: ${insights.topIndustries[0].label} (${Math.round(insights.topIndustries[0].pct * 100)}% of view).` : null,
    insights?.topMetros?.[0] ? `Heaviest metro: ${insights.topMetros[0].label}.` : null,
    insights?.topCountries?.[0] ? `${Math.round(insights.topCountries[0].pct * 100)}% from ${insights.topCountries[0].label}.` : null,
    filterParts.length ? `Active filters: ${filterParts.join(' · ')}.` : null,
    top ? `Sample accounts in view: ${top}.` : null,
    'Answer in plain prose grounded in this data; cite specific numbers when relevant.',
  ].filter(Boolean).join(' ');
}

function ReportActions({ entry, rows, filters, summary }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState('');

  function onDownload() {
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

export default function InsightsPanel({ rows, insights, filters }) {
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
                  <ReportActions entry={entry} rows={rows} filters={filters} summary={summary} />
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
