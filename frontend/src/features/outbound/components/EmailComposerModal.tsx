// EmailComposerModal — split-pane HTML composer for campaign email steps.
//
// Opened from StepInspector when the user wants more than a plain text
// area. Left pane = HTML source editor. Right pane = live preview rendered
// inside a sandboxed iframe with merge tokens replaced by mock values.
//
// On save, runs DOMPurify with an email-safe allowlist (tables, inline
// styles, images, anchors) and writes the cleaned HTML back to the step.
// Test Send fires through the existing send-test-email Edge Function.

import {
  Code,
  Copy,
  Eye,
  Loader2,
  Monitor,
  Send,
  Smartphone,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { fontDisplay, fontBody, fontMono } from "@/features/outbound/tokens";
import { sendTestEmail } from "@/lib/api";
import StarterTemplateGallery from "@/features/outbound/components/StarterTemplateGallery";
import type { StarterTemplate } from "@/features/outbound/data/starterTemplates";

type Token = { token: string; sample: string; label: string };

const TOKENS: Token[] = [
  { token: "{{first_name}}", sample: "Sarah", label: "First name" },
  { token: "{{last_name}}", sample: "Chen", label: "Last name" },
  { token: "{{full_name}}", sample: "Sarah Chen", label: "Full name" },
  { token: "{{company_name}}", sample: "DSV Air & Sea", label: "Company" },
  { token: "{{title}}", sample: "VP Logistics", label: "Title" },
  { token: "{{email}}", sample: "sarah.chen@dsv.com", label: "Email" },
  { token: "{{sender_name}}", sample: "Vince Raymond", label: "Your name" },
  { token: "{{sender_company}}", sample: "Logistic Intel", label: "Your company" },
];

// Email-safe DOMPurify config. Permissive enough for tables, inline
// styles, and CDN images; strips scripts, forms, iframes, and
// event-handler attributes. Outlook desktop and Gmail web both render
// what's left.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "html","head","body","title","style","table","thead","tbody","tfoot","tr","td","th",
    "div","span","p","br","hr","a","img","h1","h2","h3","h4","h5","h6",
    "strong","em","b","i","u","ul","ol","li","blockquote","pre","code",
    "font","center","nav","header","footer","main","article","section",
    "small","sup","sub","s","mark",
  ],
  ALLOWED_ATTR: [
    "href","src","alt","width","height","style","class","id","target","rel",
    "cellpadding","cellspacing","border","align","valign","bgcolor","role",
    "name","dir","lang","colspan","rowspan","type","data-email-tag",
  ],
  FORBID_TAGS: ["script","iframe","form","input","button","link","meta","base","embed","object","param","video","audio","source","track"],
  ALLOW_DATA_ATTR: true,
  WHOLE_DOCUMENT: true,
};

interface Props {
  open: boolean;
  onClose: () => void;
  initialSubject: string;
  initialBody: string;
  // Persona / from line shown in the preview header.
  fromName?: string;
  fromEmail?: string;
  // Save the composed (sanitized) HTML and subject back to the parent.
  onSave: (next: { subject: string; body: string }) => void;
  // Optional: open the template gallery (Step 4).
  onOpenTemplates?: () => void;
}

export default function EmailComposerModal({
  open,
  onClose,
  initialSubject,
  initialBody,
  fromName,
  fromEmail,
  onSave,
  onOpenTemplates,
}: Props) {
  const [subject, setSubject] = useState(initialSubject || "");
  const [body, setBody] = useState(initialBody || "");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | "dark">("desktop");
  const [tokenOpen, setTokenOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);

  // Re-seed when the modal reopens with a different step.
  useEffect(() => {
    if (!open) return;
    setSubject(initialSubject || "");
    setBody(initialBody || "");
    setDirty(false);
    setTestStatus(null);
  }, [open, initialSubject, initialBody]);

  // Keyboard: Esc closes, Cmd/Ctrl+S saves.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject, body]);

  function handleClose() {
    if (dirty && !window.confirm("Discard your changes to this email?")) return;
    onClose();
  }

  function handleSave() {
    const clean = DOMPurify.sanitize(body, SANITIZE_CONFIG as any).toString();
    onSave({ subject: subject.trim(), body: clean });
    onClose();
  }

  function insertAtCursor(text: string) {
    const ta = sourceRef.current;
    if (!ta) {
      setBody((prev) => prev + text);
      setDirty(true);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    setDirty(true);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
    });
  }

  async function handleTestSend() {
    if (!testTo.trim()) return;
    setTestSending(true);
    setTestStatus(null);
    const renderedSubject = renderTokens(subject || "(no subject)");
    const cleanedBody = DOMPurify.sanitize(body, SANITIZE_CONFIG as any).toString();
    const renderedBody = renderTokens(cleanedBody);
    const res = await sendTestEmail(testTo.trim(), `[TEST] ${renderedSubject}`, renderedBody, true);
    setTestSending(false);
    if ("ok" in res && res.ok) {
      setTestStatus({ kind: "ok", msg: `Sent to ${res.to} from ${res.provider}.` });
    } else if ("setupRequired" in res) {
      setTestStatus({ kind: "err", msg: "Connect Gmail or Outlook in Settings first." });
    } else if ("configError" in res) {
      setTestStatus({ kind: "err", msg: "Test send unavailable in this environment." });
    } else {
      setTestStatus({ kind: "err", msg: (res as any).error || "Test send failed." });
    }
  }

  // Live preview HTML — sanitize, inject merge values for visual fidelity.
  // Wrapped in a minimal HTML scaffold so iframe srcDoc renders cleanly
  // even when the user only typed a fragment.
  const previewHtml = useMemo(() => {
    const cleaned = DOMPurify.sanitize(body, SANITIZE_CONFIG as any).toString();
    const rendered = renderTokens(cleaned);
    const isDark = previewMode === "dark";
    const bg = isDark ? "#0F172A" : "#F8FAFC";
    const fg = isDark ? "#E2E8F0" : "#0F172A";
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>preview</title>
<style>
html,body{margin:0;padding:0;background:${bg};color:${fg};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
.preview-container{max-width:600px;margin:24px auto;background:#fff;color:#0F172A;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;}
.preview-meta{padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B;}
.preview-meta .from{color:#0F172A;font-weight:600;}
.preview-body{padding:16px;font-size:14px;line-height:1.55;}
img{max-width:100%;height:auto;}
table{max-width:100%;}
</style></head>
<body>
<div class="preview-container">
  <div class="preview-meta">
    <div class="from">${escapeHtml(fromName || "Your name")} &lt;${escapeHtml(fromEmail || "you@example.com")}&gt;</div>
    <div>To: ${escapeHtml(SAMPLE_VALUES.email)}</div>
    <div>Subject: ${escapeHtml(renderTokens(subject || "(no subject)"))}</div>
  </div>
  <div class="preview-body">${rendered || '<em style="color:#94A3B8;">Write some HTML on the left to see a preview.</em>'}</div>
</div>
</body></html>`;
  }, [body, subject, fromName, fromEmail, previewMode]);

  if (!open) return null;

  const charCount = body.length;
  const previewWidth = previewMode === "mobile" ? "414px" : "100%";

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-slate-950/50 backdrop-blur-[2px]"
        onClick={handleClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 z-[81] flex h-[90vh] w-[min(1280px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
        role="dialog"
        aria-label="Compose email"
      >
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Code className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
              placeholder="Subject — keep it under 50 chars for inbox truncation"
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-300"
              style={{ fontFamily: fontDisplay }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => (onOpenTemplates ? onOpenTemplates() : setGalleryOpen(true))}
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
              style={{ fontFamily: fontDisplay }}
              title="Start from a branded template"
            >
              <Copy className="h-3 w-3" />
              Templates
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
              style={{ fontFamily: fontDisplay }}
              title="Save and close (⌘S)"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
              aria-label="Close composer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Body — split-pane */}
        <div className="grid min-h-0 flex-1 grid-cols-2">
          {/* Source editor */}
          <div className="flex min-h-0 flex-col border-r border-slate-200 bg-[#0F172A]">
            <div
              className="flex items-center justify-between border-b border-slate-800 bg-[#0B1220] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400"
              style={{ fontFamily: fontDisplay }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Code className="h-3 w-3" />
                HTML Source
              </span>
              <span className="text-slate-500" style={{ fontFamily: fontMono }}>
                {charCount.toLocaleString()} chars
              </span>
            </div>
            <textarea
              ref={sourceRef}
              value={body}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }}
              spellCheck={false}
              placeholder={PLACEHOLDER_HTML}
              className="min-h-0 flex-1 resize-none border-0 bg-[#0F172A] px-4 py-3 text-[12.5px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
              style={{ fontFamily: fontMono }}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  insertAtCursor("  ");
                }
              }}
            />
          </div>

          {/* Live preview */}
          <div className="flex min-h-0 flex-col bg-slate-100">
            <div
              className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500"
              style={{ fontFamily: fontDisplay }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                Live Preview
              </span>
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[10px]">
                {[
                  { k: "desktop", label: "Desktop", icon: Monitor },
                  { k: "mobile", label: "Mobile", icon: Smartphone },
                  { k: "dark", label: "Dark", icon: Eye },
                ].map((m) => {
                  const Icon = m.icon;
                  const active = previewMode === m.k;
                  return (
                    <button
                      key={m.k}
                      type="button"
                      onClick={() => setPreviewMode(m.k as any)}
                      className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-semibold ${
                        active
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-slate-100 p-4">
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="h-full rounded-lg border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.08)]"
                style={{ width: previewWidth, minHeight: "320px" }}
              />
            </div>
          </div>
        </div>

        {/* Footer — token insertion + test send */}
        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setTokenOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              style={{ fontFamily: fontDisplay }}
            >
              <Tag className="h-3 w-3" />
              Insert Token
            </button>
            {tokenOpen ? (
              <div className="absolute bottom-full left-0 z-10 mb-1 w-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                <div
                  className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500"
                  style={{ fontFamily: fontDisplay }}
                >
                  Merge tokens
                </div>
                <ul className="max-h-[280px] overflow-y-auto">
                  {TOKENS.map((t) => (
                    <li key={t.token}>
                      <button
                        type="button"
                        onClick={() => { insertAtCursor(t.token); setTokenOpen(false); }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-blue-50"
                      >
                        <div className="min-w-0">
                          <div
                            className="truncate text-[11.5px] font-semibold text-slate-900"
                            style={{ fontFamily: fontDisplay }}
                          >
                            {t.label}
                          </div>
                          <div
                            className="truncate text-[10.5px] text-slate-500"
                            style={{ fontFamily: fontMono }}
                          >
                            {t.token}
                          </div>
                        </div>
                        <div
                          className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                          style={{ fontFamily: fontBody }}
                        >
                          {t.sample}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setBody("")}
            disabled={body.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            style={{ fontFamily: fontDisplay }}
            title="Clear the source editor"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@yourdomain.com"
              className="w-[220px] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-300"
              style={{ fontFamily: fontBody }}
            />
            <button
              type="button"
              onClick={handleTestSend}
              disabled={testSending || !testTo.trim()}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-gradient-to-b from-emerald-500 to-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
              style={{ fontFamily: fontDisplay }}
            >
              {testSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Test Send
            </button>
          </div>
        </footer>

        {testStatus ? (
          <div
            className={`shrink-0 border-t px-4 py-1.5 text-[11px] ${
              testStatus.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
            style={{ fontFamily: fontBody }}
          >
            {testStatus.msg}
          </div>
        ) : null}
      </div>
      <StarterTemplateGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onPick={(t: StarterTemplate) => {
          setSubject(t.subject);
          setBody(t.body_html);
          setDirty(true);
          setGalleryOpen(false);
        }}
      />
    </>
  );
}

// Sample merge values used in the live preview iframe and Test Send.
// Real merges happen at dispatch time inside the campaign worker.
const SAMPLE_VALUES: Record<string, string> = {
  first_name: "Sarah",
  last_name: "Chen",
  full_name: "Sarah Chen",
  company_name: "DSV Air & Sea",
  title: "VP Logistics",
  email: "sarah.chen@dsv.com",
  sender_name: "Vince Raymond",
  sender_company: "Logistic Intel",
};

function renderTokens(input: string): string {
  if (!input) return "";
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
    const v = SAMPLE_VALUES[key.toLowerCase()];
    return v == null ? `{{${key}}}` : v;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PLACEHOLDER_HTML = `<!-- Paste or write HTML here. Tip: cmd-S saves. -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" style="padding:24px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="font-family:Georgia,serif;font-size:18px;line-height:1.5;color:#0F172A;">
        Hi {{first_name}},

        Logistic Intel pulls live shipping data from {{company_name}}'s
        bills of lading and turns it into a list of decision-makers your
        team can actually call.

        Worth 15 minutes next week?

        — {{sender_name}}
      </td></tr>
    </table>
  </td></tr>
</table>`;
