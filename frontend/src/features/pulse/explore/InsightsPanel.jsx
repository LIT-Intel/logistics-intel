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
import { reasonOverExplore } from '@/api/pulse';
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

// Aggregate a per-key count from row entries, return top-N as a structured
// [{ label, count }] list. Used to feed the Coach precomputed aggregates
// over ALL rows (not a prose blurb).
function topN(rows, getter, n = 8) {
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
    .map(([label, count]) => ({ label, count }));
}

// Parse a COUNT intent out of the question ("give me 2 companies", "top
// 50", "show 1000"). Returns the requested N, or null. Done in JS so the
// model never has to "count" — we slice the rows to N and let it narrate.
function parseCountIntent(question) {
  const q = String(question || '').toLowerCase();
  // "top N", "show N", "give me N", "list N", "first N", "N companies/accounts"
  const m =
    q.match(/\b(?:top|show|give\s+me|list|first|pull|find|get)\s+(\d{1,5})\b/) ||
    q.match(/\b(\d{1,5})\s+(?:companies|accounts|shippers|importers|exporters|firms|prospects|leads)\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, 5000);
}

// Parse a "segment" request out of the coach question so a generated report can
// be scoped to JUST what was asked ("…with 200 TEU or more", "100+ shipments",
// "importing from China") instead of dumping the whole result set. Operates on
// fields already present on each row (teu / shipments / top_dimensions lanes).
function num(s) { return Number(String(s).replace(/,/g, '')); }
export function parseReportSegment(question) {
  const q = ` ${String(question || '').toLowerCase()} `;
  const seg = { teuMin: null, teuMax: null, shipMin: null, shipMax: null, lane: null };
  const labels = [];
  const threshold = (unit) => {
    const min = q.match(new RegExp(`(?:over|above|at least|minimum|min|more than|greater than|>=?\\s*)\\s*(\\d[\\d,]*)\\s*${unit}`))
      || q.match(new RegExp(`(\\d[\\d,]*)\\s*\\+?\\s*${unit}\\s*(?:or more|or above|or higher|and (?:up|above|over|more)|plus)`))
      || q.match(new RegExp(`(\\d[\\d,]*)\\s*\\+\\s*${unit}`));
    const max = q.match(new RegExp(`(?:under|below|less than|fewer than|at most|max(?:imum)?|<=?\\s*)\\s*(\\d[\\d,]*)\\s*${unit}`));
    return { min: min ? num(min[1]) : null, max: max ? num(max[1]) : null };
  };
  const teu = threshold('teu\\b');
  seg.teuMin = teu.min; seg.teuMax = teu.max;
  const ship = threshold('(?:shipments?|bols?)\\b');
  seg.shipMin = ship.min; seg.shipMax = ship.max;
  const lm = q.match(/\b(?:import(?:ing|s|ed)?\s+from|sourcing\s+from|from|via|through|out of)\s+([a-z][a-z .'-]{1,28}?)(?:\s+(?:to|and|with|that|who|which|importing|exporting|by|,|\.)|\s*$)/);
  if (lm && lm[1].trim().length > 1) seg.lane = lm[1].trim();
  if (seg.teuMin != null) labels.push(`TEU ≥ ${seg.teuMin.toLocaleString()}`);
  if (seg.teuMax != null) labels.push(`TEU ≤ ${seg.teuMax.toLocaleString()}`);
  if (seg.shipMin != null) labels.push(`Shipments ≥ ${seg.shipMin.toLocaleString()}`);
  if (seg.shipMax != null) labels.push(`Shipments ≤ ${seg.shipMax.toLocaleString()}`);
  if (seg.lane) labels.push(`Lane ~ "${seg.lane}"`);
  return { seg, label: labels.join('  •  '), active: labels.length > 0 };
}

export function applyReportSegment(rows, seg) {
  if (!seg) return rows;
  return rows.filter((r) => {
    const teu = Number(r.teu) || 0;
    const ship = Number(r.shipments) || 0;
    if (seg.teuMin != null && !(teu >= seg.teuMin)) return false;
    if (seg.teuMax != null && !(teu <= seg.teuMax)) return false;
    if (seg.shipMin != null && !(ship >= seg.shipMin)) return false;
    if (seg.shipMax != null && !(ship <= seg.shipMax)) return false;
    if (seg.lane) {
      const dims = Array.isArray(r.top_dimensions) ? r.top_dimensions : [];
      if (!dims.some((d) => String(d?.lane ?? '').toLowerCase().includes(seg.lane))) return false;
    }
    return true;
  });
}

// Trim a row down to the fields the Coach reasons over, so the payload
// stays bounded even for large samples.
function trimRow(r) {
  return {
    company_name: r?.company_name ?? null,
    city: r?.city ?? null,
    state: r?.state ?? null,
    country: r?.country ?? null,
    industry: r?.industry ?? null,
    vertical: r?.vertical ?? null,
    teu: r?.teu ?? null,
    shipments: r?.shipments ?? null,
    revenue: r?.revenue ?? null,
    opportunity_composite_score: r?.opportunity_composite_score ?? null,
    top_lanes: Array.isArray(r?.top_dimensions)
      ? r.top_dimensions.slice(0, 3).map((d) => d?.lane).filter(Boolean)
      : undefined,
    top_forwarders: Array.isArray(r?.top_forwarders)
      ? r.top_forwarders.slice(0, 3).map((f) => f?.name).filter(Boolean)
      : undefined,
  };
}

// Build the STRUCTURED snapshot the Coach reasons over: aggregates across
// ALL rows + a capped, opportunity-sorted sample. Replaces the old prose
// "context blurb" that was concatenated into the question string and
// contaminated the server-side parser (the "country=United States" bug).
function buildExploreSnapshot({ rows, insights, filters, question }) {
  const total = rows.length;

  // Sort once by opportunity score so both the sample and any COUNT slice
  // are deterministic and meaningful.
  const sorted = [...rows].sort(
    (a, b) => (Number(b?.opportunity_composite_score) || 0) - (Number(a?.opportunity_composite_score) || 0),
  );

  // COUNT intent: slice exactly N; otherwise a representative top-60 sample.
  const requested = parseCountIntent(question);
  const sampleN = requested != null ? requested : 60;
  const sampleRows = sorted.slice(0, sampleN).map(trimRow);

  const sumTeu = rows.reduce((a, r) => {
    const v = Number(r?.teu); return Number.isFinite(v) ? a + v : a;
  }, 0);
  const sumRev = rows.reduce((a, r) => {
    const v = Number(r?.revenue); return Number.isFinite(v) ? a + v : a;
  }, 0);
  const sumShipments = rows.reduce((a, r) => a + (Number(r?.shipments) || 0), 0);
  const teuVals = rows.map((r) => Number(r?.teu)).filter(Number.isFinite);
  const avgTeu = teuVals.length ? Math.round(sumTeu / teuVals.length) : 0;
  const teuGe500 = teuVals.filter((t) => t >= 500).length;

  const freshness = { live: 0, saved: 0, directory: 0 };
  for (const r of rows) {
    const chip = r?.freshness?.chip ?? 'directory';
    if (freshness[chip] != null) freshness[chip]++;
  }

  const totals = {
    account_count: total,
    requested_count: requested,
    sample_count: sampleRows.length,
    sum_teu_12m: sumTeu,
    avg_teu_12m: avgTeu,
    sum_revenue: sumRev,
    sum_shipments_12m: sumShipments,
    accounts_with_teu_ge_500: teuGe500,
    top_industries: insights?.topIndustries?.length
      ? insights.topIndustries.slice(0, 8).map((x) => ({ label: x.label, pct: x.pct }))
      : topN(rows, (r) => r.industry),
    top_verticals: topN(rows, (r) => r.vertical),
    top_states: topN(rows, (r) => r.state),
    top_countries: insights?.topCountries?.length
      ? insights.topCountries.slice(0, 8).map((x) => ({ label: x.label, pct: x.pct }))
      : topN(rows, (r) => r.country),
    top_metros: topN(rows, (r) => r.city),
    top_lanes: topN(rows, (r) => r.top_dimensions),
    top_forwarders: topN(rows, (r) => r.top_forwarders),
    freshness_mix: freshness,
  };

  return { totals, sampleRows };
}

function ReportActions({ entry, rows, filters, summary, requirePdf }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState('');

  // Scope the report to what the question actually asked: a TEU/shipments/lane
  // segment and/or a count ("top N"), instead of dumping the full result set.
  const { reportRows, segmentLabel } = useMemo(() => {
    const { seg, label, active } = parseReportSegment(entry.question);
    let out = active ? applyReportSegment(rows, seg) : rows;
    const labels = label ? [label] : [];
    const n = parseCountIntent(entry.question);
    if (n != null) {
      out = [...out]
        .sort((a, b) => (Number(b.opportunity_composite_score) || 0) - (Number(a.opportunity_composite_score) || 0))
        .slice(0, n);
      labels.push(`Top ${n.toLocaleString()}`);
    }
    return { reportRows: out, segmentLabel: labels.join('  •  ') || undefined };
  }, [entry.question, rows]);

  async function onDownload() {
    // Server-side export_pdf gate. requirePdf is async (it calls
    // export-company-profile intent='check' which enforces + consumes the
    // quota server-side); trial users get the upgrade modal and we abort.
    if (requirePdf && !(await requirePdf())) return;
    try {
      generatePulseReportPdf({
        title: 'LIT Pulse Explorer Report',
        question: entry.question,
        answerMd: entry.answer,
        rows: reportRows,
        filters,
        summary,
        segmentLabel,
      });
      toast.success(
        segmentLabel
          ? `Report PDF downloaded (${reportRows.length.toLocaleString()} accounts)`
          : 'Report PDF downloaded'
      );
    } catch (err) {
      toast.error(err?.message ?? 'PDF export failed');
    }
  }

  async function onSendEmail(e) {
    e?.preventDefault?.();
    if (requirePdf && !(await requirePdf())) return;
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
        rows: reportRows,
        filters,
        summary,
        segmentLabel,
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
    // Build a STRUCTURED snapshot (aggregates over all rows + a capped,
    // opportunity-sorted sample). No prose blurb concatenated into the
    // question — that's what contaminated the server parser before.
    const { totals, sampleRows } = buildExploreSnapshot({ rows, insights, filters, question });
    try {
      const resp = await reasonOverExplore({
        question,
        filters: filters ?? {},
        totals,
        sampleRows,
      });
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
