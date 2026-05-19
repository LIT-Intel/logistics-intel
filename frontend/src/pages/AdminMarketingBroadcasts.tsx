/**
 * /app/admin/marketing-broadcasts — Constant Contact-style composer for
 * one-off Resend broadcasts to LIT's 12 audiences (4 funnel + 4 industry
 * + 4 channel). Mirrors the visual language of AdminMarketingAnalytics:
 * slate-200 borders, rounded-2xl cards, brand-blue primary actions,
 * mono-tabular numbers for counts.
 *
 * Architecture:
 *   - composer + history live in this single page
 *   - send/save goes through /api/admin/broadcasts (marketing-site proxy)
 *     so RESEND_API_KEY stays server-side
 *   - audit history is read from public.lit_broadcasts via the same proxy
 *
 * Route guard: <RequireSuperAdmin> in App.jsx.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Eye,
  Mail,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  AUDIENCE_OPTIONS,
  DEFAULT_FROM_EMAIL,
  TEMPLATE_OPTIONS,
  createBroadcast,
  fmtRelative,
  getBroadcast,
  listBroadcasts,
  statusTone,
  type AudienceOption,
  type Broadcast,
  type CreateBroadcastPayload,
} from "@/api/marketingBroadcasts";

// Subject-line sweet spot per inbox-preview testing: 50–60 chars renders
// fully on desktop + mobile clients without truncation.
const SUBJECT_TARGET_MIN = 50;
const SUBJECT_TARGET_MAX = 60;
const PREVIEW_TARGET_MAX = 110;

export default function AdminMarketingBroadcasts() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [composerSeed, setComposerSeed] = useState<Partial<CreateBroadcastPayload> | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    listBroadcasts(150)
      .then((rows) => {
        if (cancelled) return;
        setBroadcasts(rows);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to load broadcasts");
        setBroadcasts([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const openNew = () => setComposerSeed({});
  const openDuplicate = (b: Broadcast) =>
    setComposerSeed({
      name: `${b.name} (copy)`,
      audience_id: b.audience_id,
      audience_name: b.audience_name ?? undefined,
      from: b.from_email,
      reply_to: b.reply_to_email ?? undefined,
      subject: b.subject,
      preview_text: b.preview_text ?? undefined,
      html: b.html ?? "",
    });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600">
            <Send className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
              Marketing broadcasts
            </span>
          </div>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-slate-900">
            One-off email sends
          </h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
            Compose, schedule, and ship broadcasts to any of the 12 Resend
            Audiences — funnel stage, freight role, or acquisition channel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Sparkles className="h-3.5 w-3.5" />
            New broadcast
          </button>
        </div>
      </div>

      {err && (
        <div
          className="mt-6 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{err}</span>
        </div>
      )}

      {/* History */}
      <div className="mt-6">
        <BroadcastTable
          rows={broadcasts}
          loading={loading}
          onRowClick={(id) => setDrawerId(id)}
          onDuplicate={openDuplicate}
        />
      </div>

      {composerSeed !== null && (
        <ComposerDrawer
          seed={composerSeed}
          onClose={() => setComposerSeed(null)}
          onSent={() => {
            setComposerSeed(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {drawerId && (
        <DetailDrawer id={drawerId} onClose={() => setDrawerId(null)} />
      )}
    </div>
  );
}

// ────────────────────────── History table ──────────────────────────

function BroadcastTable({
  rows,
  loading,
  onRowClick,
  onDuplicate,
}: {
  rows: Broadcast[];
  loading: boolean;
  onRowClick: (id: string) => void;
  onDuplicate: (b: Broadcast) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex items-end justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-[15.5px] font-semibold text-slate-900">
            Broadcast history
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Past sends + drafts, newest first.
          </p>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <Th>Name</Th>
            <Th>Audience</Th>
            <Th>Status</Th>
            <Th>Scheduled / sent</Th>
            <Th align="right">Recipients</Th>
            <Th align="right" />
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No broadcasts yet. Click "New broadcast" to compose your first.
                </td>
              </tr>
            ) : (
              rows.map((b) => {
                const tone = statusTone(b.status);
                const when = b.sent_at || b.scheduled_at || b.updated_at;
                return (
                  <tr
                    key={b.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/60"
                    onClick={() => onRowClick(b.id)}
                  >
                    <Td>
                      <div className="font-medium text-slate-800">{b.name}</div>
                      <div
                        className="mt-0.5 max-w-[360px] truncate text-[11.5px] text-slate-500"
                        title={b.subject}
                      >
                        {b.subject}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-slate-700">
                        {b.audience_name || b.audience_id}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]",
                          tone.bg,
                          tone.text,
                        ].join(" ")}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                        {tone.label}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[12px] text-slate-500" title={when ?? ""}>
                        {fmtRelative(when)}
                      </span>
                    </Td>
                    <Td align="right">
                      {typeof b.sent_count === "number"
                        ? b.sent_count.toLocaleString()
                        : "—"}
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11.5px] font-semibold text-slate-600 transition hover:bg-slate-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate(b);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                        Duplicate
                      </button>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ────────────────────────── Composer drawer ──────────────────────────

function ComposerDrawer({
  seed,
  onClose,
  onSent,
}: {
  seed: Partial<CreateBroadcastPayload>;
  onClose: () => void;
  onSent: () => void;
}) {
  const [name, setName] = useState(seed.name ?? "");
  const [audienceId, setAudienceId] = useState(
    seed.audience_id ?? AUDIENCE_OPTIONS[0].value,
  );
  const [fromEmail, setFromEmail] = useState(seed.from ?? DEFAULT_FROM_EMAIL);
  const [replyTo, setReplyTo] = useState(seed.reply_to ?? DEFAULT_FROM_EMAIL);
  const [subject, setSubject] = useState(seed.subject ?? "");
  const [previewText, setPreviewText] = useState(seed.preview_text ?? "");
  const [html, setHtml] = useState(seed.html ?? DEFAULT_HTML_SHELL);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<string>(() => defaultFutureIso());
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [templateSelect, setTemplateSelect] = useState<string>("");

  const audienceOpt: AudienceOption | undefined = useMemo(
    () => AUDIENCE_OPTIONS.find((a) => a.value === audienceId),
    [audienceId],
  );

  const subjectLen = subject.length;
  const previewLen = previewText.length;

  const subjectTone =
    subjectLen === 0
      ? "text-slate-400"
      : subjectLen >= SUBJECT_TARGET_MIN && subjectLen <= SUBJECT_TARGET_MAX
        ? "text-emerald-600"
        : subjectLen > SUBJECT_TARGET_MAX
          ? "text-amber-600"
          : "text-slate-500";

  const previewTone =
    previewLen === 0
      ? "text-slate-400"
      : previewLen <= PREVIEW_TARGET_MAX
        ? "text-emerald-600"
        : "text-amber-600";

  const onSubmit = async (action: "send" | "schedule") => {
    setErr(null);
    if (!name.trim()) {
      setErr("Internal name is required.");
      return;
    }
    if (!subject.trim()) {
      setErr("Subject is required.");
      return;
    }
    if (!html.trim()) {
      setErr("HTML body is required.");
      return;
    }
    if (action === "schedule" && !scheduledAt) {
      setErr("Pick a future date+time, or switch to send now.");
      return;
    }

    setSending(true);
    try {
      await createBroadcast({
        name: name.trim(),
        audience_id: audienceId.trim(),
        audience_name: audienceOpt?.label,
        from: fromEmail.trim() || DEFAULT_FROM_EMAIL,
        reply_to: replyTo.trim() || fromEmail.trim() || DEFAULT_FROM_EMAIL,
        subject: subject.trim(),
        preview_text: previewText.trim() || undefined,
        html,
        scheduled_at:
          action === "schedule" ? new Date(scheduledAt).toISOString() : null,
      });
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const loadTemplate = (envVar: string) => {
    if (!envVar) return;
    setTemplateSelect(envVar);
    const t = TEMPLATE_OPTIONS.find((x) => x.envVar === envVar);
    if (!t) return;
    if (!subject) setSubject(t.subject);
    // v1: we don't fetch the actual drip HTML server-side yet. Stamp a
    // template-aware placeholder so the operator sees what they picked.
    setHtml(
      `<!-- Seeded from ${t.label} (${t.envVar})\n     Replace with the broadcast HTML you want to send. -->\n` +
        DEFAULT_HTML_SHELL,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close composer"
        className="flex-1 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600">
              <Mail className="h-4 w-4" aria-hidden />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
                Compose broadcast
              </span>
            </div>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-slate-900">
              {seed.id ? "Edit broadcast" : "New broadcast"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Field label="Internal name" hint="Operator-only — never shown to recipients.">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. May-19 Trial Leads — pricing announcement"
              className="block w-full rounded-md border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </Field>

          <Field label="Audience">
            <select
              value={audienceId}
              onChange={(e) => setAudienceId(e.target.value)}
              className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {(["Funnel", "Industry", "Channel"] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {AUDIENCE_OPTIONS.filter((a) => a.group === group).map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-slate-500">
              The server resolves <span className="font-mono">{audienceId}</span>{" "}
              to its <span className="font-mono">aud_*</span> id at send.
            </p>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="From">
              <input
                type="text"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </Field>
            <Field label="Reply-to">
              <input
                type="text"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </Field>
          </div>

          <Field
            label={
              <span className="flex items-center justify-between">
                <span>Subject</span>
                <span className={`font-mono text-[11px] ${subjectTone}`}>
                  {subjectLen}/{SUBJECT_TARGET_MAX} chars
                </span>
              </span>
            }
            hint="Sweet spot: 50–60 chars renders fully on desktop + mobile."
          >
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="block w-full rounded-md border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </Field>

          <Field
            label={
              <span className="flex items-center justify-between">
                <span>Preview text</span>
                <span className={`font-mono text-[11px] ${previewTone}`}>
                  {previewLen}/{PREVIEW_TARGET_MAX} chars
                </span>
              </span>
            }
            hint="The grey snippet inboxes show under the subject."
          >
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="One-liner that complements the subject"
              className="block w-full rounded-md border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </Field>

          <Field
            label={
              <span className="flex items-center justify-between">
                <span>Body HTML</span>
                <span className="flex items-center gap-2">
                  <select
                    value={templateSelect}
                    onChange={(e) => loadTemplate(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-600 outline-none focus:border-blue-400"
                  >
                    <option value="">Use template…</option>
                    {TEMPLATE_OPTIONS.map((t) => (
                      <option key={t.envVar} value={t.envVar}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11.5px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                </span>
              </span>
            }
            hint="Paste your final marketing HTML. We do not wrap it server-side in v1."
          >
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={14}
              className="block w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-[12px] leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </Field>

          <Field label="Schedule">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-[13px] text-slate-700">
                <input
                  type="radio"
                  checked={scheduleMode === "now"}
                  onChange={() => setScheduleMode("now")}
                />
                Send now
              </label>
              <label className="inline-flex items-center gap-2 text-[13px] text-slate-700">
                <input
                  type="radio"
                  checked={scheduleMode === "later"}
                  onChange={() => setScheduleMode("later")}
                />
                Schedule for…
              </label>
              {scheduleMode === "later" && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="rounded-md border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              )}
            </div>
          </Field>

          {err && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
            disabled={sending}
          >
            Cancel
          </button>
          {scheduleMode === "later" ? (
            <button
              type="button"
              onClick={() => onSubmit("schedule")}
              disabled={sending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {sending ? "Scheduling…" : "Schedule broadcast"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSubmit("send")}
              disabled={sending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? "Sending…" : "Send now"}
            </button>
          )}
        </footer>
      </aside>

      {showPreview && (
        <HtmlPreviewModal html={html} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

function HtmlPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const doc = f.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html || "<p style=\"color:#94a3b8;font-family:system-ui;padding:24px\">(empty)</p>");
    doc.close();
  }, [html]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-800">
            <Eye className="h-4 w-4 text-blue-600" />
            HTML preview
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <iframe
          ref={ref}
          title="Broadcast HTML preview"
          className="h-full w-full flex-1 bg-white"
          sandbox=""
        />
      </div>
    </div>
  );
}

// ────────────────────────── Detail drawer ──────────────────────────

function DetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [bc, setBc] = useState<Broadcast | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBroadcast(id)
      .then((b) => {
        if (!cancelled) setBc(b);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tone = bc ? statusTone(bc.status) : null;
  const resendUrl = bc?.resend_broadcast_id
    ? `https://resend.com/broadcasts/${encodeURIComponent(bc.resend_broadcast_id)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close details"
        className="flex-1 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">
              Broadcast detail
            </div>
            <h2 className="mt-1 truncate text-[18px] font-semibold tracking-[-0.01em] text-slate-900">
              {bc?.name || "Loading…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5 text-[13.5px] text-slate-700">
          {err && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
              {err}
            </div>
          )}
          {bc && (
            <dl className="space-y-3.5">
              <DetailRow label="Status">
                {tone && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] ${tone.bg} ${tone.text}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    {tone.label}
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Audience">
                {bc.audience_name || bc.audience_id}
              </DetailRow>
              <DetailRow label="From">{bc.from_email}</DetailRow>
              <DetailRow label="Reply-to">{bc.reply_to_email || "—"}</DetailRow>
              <DetailRow label="Subject">{bc.subject}</DetailRow>
              <DetailRow label="Preview text">{bc.preview_text || "—"}</DetailRow>
              <DetailRow label="Scheduled at">
                {bc.scheduled_at
                  ? new Date(bc.scheduled_at).toLocaleString()
                  : "—"}
              </DetailRow>
              <DetailRow label="Sent at">
                {bc.sent_at ? new Date(bc.sent_at).toLocaleString() : "—"}
              </DetailRow>
              <DetailRow label="Recipients">
                {typeof bc.sent_count === "number"
                  ? bc.sent_count.toLocaleString()
                  : "—"}
              </DetailRow>
              <DetailRow label="Resend id">
                <span className="font-mono text-[11.5px] text-slate-600">
                  {bc.resend_broadcast_id || "—"}
                </span>
              </DetailRow>
              {resendUrl && (
                <DetailRow label="Resend dashboard">
                  <a
                    href={resendUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Open in Resend →
                  </a>
                </DetailRow>
              )}
            </dl>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
      <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </dt>
      <dd className="min-w-0 text-slate-800">{children}</dd>
    </div>
  );
}

// ────────────────────────── Primitives ──────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-[12px] font-semibold text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={[
        "bg-slate-50/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500",
        align === "right" ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={[
        "px-4 py-2.5 text-slate-700",
        align === "right" ? "text-right font-mono tabular-nums" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

// ────────────────────────── Defaults ──────────────────────────

function defaultFutureIso(): string {
  // datetime-local input expects "YYYY-MM-DDTHH:mm" in the user's local tz.
  // Default to "tomorrow at 9am local".
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DEFAULT_HTML_SHELL = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#0F172A;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3b82f6;">Logistic Intel</div>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0F172A;">Replace this with your headline.</h1>
          </td></tr>
          <tr><td style="padding:16px 32px 24px;font-size:14px;line-height:1.6;color:#475569;">
            <p style="margin:0 0 14px;">Hi there,</p>
            <p style="margin:0 0 14px;">Replace this body copy with your broadcast content.</p>
            <p style="margin:0 0 14px;">
              <a href="https://logisticintel.com" style="display:inline-block;padding:12px 22px;background:linear-gradient(180deg,#3B82F6,#2563EB);color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Primary CTA →</a>
            </p>
          </td></tr>
          <tr><td style="padding:16px 32px 28px;border-top:1px solid #EEF2F7;font-size:12px;line-height:1.55;color:#94a3b8;">
            Logistic Intel · pulse@logisticintel.com
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
