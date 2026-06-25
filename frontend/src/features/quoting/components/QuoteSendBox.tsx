/**
 * QuoteSendBox — right-column panel for emailing the quote to the customer.
 *
 * Loads the workspace's connected email accounts (`listEmailAccounts`,
 * filtered to status === "connected"), lets the user pick a sender, edit the
 * recipient + subject + body, and sends via the `quote-send` edge function.
 *
 * The PDF must exist before sending: the server returns code `PDF_REQUIRED`
 * if no PDF is on file, and we also guard client-side by requiring a
 * `signedUrl` before enabling Send.
 */
import { useEffect, useMemo, useState } from "react";
import { Send, Loader2, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";

import { quoting, type Quote } from "@/api/quoting";
import { listEmailAccounts } from "@/lib/api";
import type { LitEmailAccountRow } from "@/types/lit-outbound";
import { EdgeFunctionError } from "@/api/_client";
import { USES_PORTS } from "@/lib/quoting/modeFields";

export interface QuoteSendBoxProps {
  quote: Quote;
  signedUrl?: string | null;
  onSent: () => void;
}

function usd(value: unknown, currency = "USD"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/** Mode-aware origin → destination label for subject/body prefill. */
function laneLabel(q: Quote): string {
  const usesPorts = q.mode ? USES_PORTS[q.mode] : false;
  const origin = usesPorts ? q.origin_port : q.origin_city;
  const dest = usesPorts ? q.destination_port : q.destination_city;
  if (origin || dest) return `${origin ?? "Origin"} → ${dest ?? "Destination"}`;
  return "your shipment";
}

function fmtDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function QuoteSendBox({ quote, signedUrl, onSent }: QuoteSendBoxProps) {
  const [accounts, setAccounts] = useState<LitEmailAccountRow[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [emailAccountId, setEmailAccountId] = useState<string>("");

  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const lane = useMemo(() => laneLabel(quote), [quote]);

  const [subject, setSubject] = useState(
    `Quote ${quote.quote_number} · ${lane}`,
  );
  const [body, setBody] = useState(() => {
    const total = usd(quote.total_sell, quote.currency);
    const validLine = quote.valid_until ? `\nThis quote is valid until ${fmtDate(quote.valid_until)}.` : "";
    return [
      `Hi there,`,
      "",
      `Please find your freight quote for ${lane}. The total is ${total}.${validLine}`,
      "",
      "A secure link to the full quote PDF is included below — opening it lets us confirm receipt.",
      "",
      "Happy to walk through any line item or adjust the scope. Just reply to this email.",
      "",
      "Best regards,",
    ].join("\n");
  });

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load connected email accounts; default to the primary one.
  useEffect(() => {
    let cancelled = false;
    setAccountsLoading(true);
    listEmailAccounts()
      .then((rows) => {
        if (cancelled) return;
        const connected = rows.filter((r) => r.status === "connected");
        setAccounts(connected);
        const primary = connected.find((r) => r.is_primary) ?? connected[0];
        if (primary) setEmailAccountId(primary.id);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasPdf = Boolean(signedUrl);
  const canSend = hasPdf && toEmail.trim().length > 3 && !sending && !sent;

  async function handleSend() {
    setError(null);
    if (!hasPdf) {
      setError("Generate the PDF before sending so the customer receives the secure link.");
      return;
    }
    if (!toEmail.trim()) {
      setError("Add a recipient email address.");
      return;
    }
    setSending(true);
    try {
      await quoting.send({
        quote_id: quote.id,
        email_account_id: emailAccountId || undefined,
        to_email: toEmail.trim(),
        to_name: toName.trim() || undefined,
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
      });
      setSent(true);
      onSent();
    } catch (e) {
      if (e instanceof EdgeFunctionError && e.code === "PDF_REQUIRED") {
        setError("This quote needs a PDF before it can be sent. Generate the PDF, then try again.");
      } else {
        setError(e instanceof Error ? e.message : "Failed to send the quote.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-display text-[13px] font-bold text-slate-900">Send Quote</h3>

      {sent ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          <div className="text-[13px] font-bold text-emerald-800">Sent ✓</div>
          <p className="text-[12px] text-emerald-700">
            {toEmail} will receive the quote with a secure, view-tracked link.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Sender */}
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>From</span>
            {accountsLoading ? (
              <div className="flex h-10 items-center gap-2 rounded-[9px] border border-slate-200 bg-slate-50 px-3 text-[12px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading accounts…
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-[9px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
                No connected email account. Connect one in Settings → Email to send quotes.
              </div>
            ) : (
              <select
                value={emailAccountId}
                onChange={(e) => setEmailAccountId(e.target.value)}
                className={inputCls}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name ? `${a.display_name} · ${a.email}` : a.email}
                    {a.is_primary ? " (primary)" : ""}
                  </option>
                ))}
              </select>
            )}
          </label>

          {/* Recipient */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>To Email</span>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="buyer@company.com"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>To Name</span>
              <input
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="Optional"
                className={inputCls}
              />
            </label>
          </div>

          {/* Subject */}
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
          </label>

          {/* Body */}
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              className={inputCls + " h-auto py-2 leading-relaxed"}
            />
          </label>

          {/* Secure-link / tracking note */}
          <div className="flex items-start gap-2 rounded-[10px] border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11.5px] text-blue-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
            <span>
              A secure, expiring link to the quote PDF is attached automatically. Opening it marks the quote
              as <strong>Viewed</strong> so you know the moment your customer reads it.
            </span>
          </div>

          {!hasPdf && (
            <div className="flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>Generate the PDF first — the customer email includes the secure link to it.</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] px-4 font-display text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "linear-gradient(180deg,#2563eb,#1d4ed8)" }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send Quote"}
          </button>
        </div>
      )}
    </section>
  );
}

const labelCls =
  "font-display text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400";
const inputCls =
  "h-10 w-full rounded-[9px] border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15";
