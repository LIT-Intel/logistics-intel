// EmailComposerModal — split-pane composer for campaign email steps.
//
// Opened from StepInspector. Left pane has two modes:
//   - Visual: contenteditable WYSIWYG with a formatting toolbar, image
//     upload (Supabase Storage), and YouTube embed (email-safe clickable
//     thumbnail — no iframe).
//   - HTML:  raw HTML source editor (tab-to-indent preserved).
// Right pane = live preview in a sandboxed iframe with merge tokens
// replaced by mock values, plus desktop/mobile/dark toggle.
//
// On save, runs DOMPurify with an email-safe allowlist (tables, inline
// styles, images, anchors with target/rel) and writes the cleaned HTML
// back to the step. Test Send fires through send-test-email Edge Fn.

import {
  Bold,
  Code,
  Copy,
  Eye,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Monitor,
  Pilcrow,
  RemoveFormatting,
  Send,
  Smartphone,
  Tag,
  Trash2,
  Underline,
  X,
  Youtube,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { fontDisplay, fontBody, fontMono } from "@/features/outbound/tokens";
import { sendTestEmail } from "@/lib/api";
import { supabase } from "@/lib/supabase";
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

// If the initial body already looks like a full template (e.g. starter
// template HTML wraps content in <table> / <html>), open in HTML mode so
// power users can edit the table scaffold directly.
function detectInitialMode(html: string): "visual" | "html" {
  const trimmed = (html || "").trimStart().toLowerCase();
  if (!trimmed) return "visual";
  if (trimmed.startsWith("<html") || trimmed.startsWith("<!doctype") || trimmed.startsWith("<table")) {
    return "html";
  }
  return "visual";
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

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

// Parse various YouTube URL forms and return the 11-char video id, or
// null if it doesn't look like YouTube.
function extractYouTubeId(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Standard ID pattern: 11 chars of [A-Za-z0-9_-]
  const idRe = /^[A-Za-z0-9_-]{11}$/;
  // 1. Bare ID
  if (idRe.test(s)) return s;
  try {
    const url = new URL(s);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return idRe.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      // /watch?v=ID
      const v = url.searchParams.get("v");
      if (v && idRe.test(v)) return v;
      // /embed/ID  or  /shorts/ID  or  /v/ID
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["embed", "shorts", "v"].includes(parts[0])) {
        const id = parts[1];
        return idRe.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function buildYouTubeEmbed(id: string): string {
  return (
    `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" style="display:inline-block;position:relative;text-decoration:none;">` +
      `<img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" alt="Watch on YouTube" style="display:block;max-width:480px;width:100%;height:auto;border-radius:8px;border:1px solid #E2E8F0;" />` +
      `<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.78);color:#fff;font-family:Arial,sans-serif;font-size:16px;font-weight:700;padding:10px 18px;border-radius:999px;">▶ Watch</span>` +
    `</a>`
  );
}

function buildImageTag(url: string, alt = ""): string {
  const safeAlt = alt.replace(/"/g, "&quot;");
  const safeUrl = url.replace(/"/g, "&quot;");
  return `<img src="${safeUrl}" alt="${safeAlt}" style="max-width:100%;height:auto;display:block;border-radius:6px;" />`;
}

function sanitizeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "image";
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
  const [mode, setMode] = useState<"visual" | "html">(() => detectInitialMode(initialBody || ""));
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | "dark">("desktop");
  const [tokenOpen, setTokenOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  // Image upload state
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");

  // YouTube popover state
  const [ytMenuOpen, setYtMenuOpen] = useState(false);
  const [ytInput, setYtInput] = useState("");
  const [ytError, setYtError] = useState<string | null>(null);

  // Transient toast (errors / status from toolbar actions)
  const [toolbarMsg, setToolbarMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Selection saved before opening a popover so we can restore it for
  // insertion at the user's caret.
  const savedRangeRef = useRef<Range | null>(null);
  // Tracks the last body string written into the visual editor so we
  // don't clobber the user's caret on every keystroke.
  const lastVisualBodyRef = useRef<string>("");

  // Re-seed when the modal reopens with a different step.
  useEffect(() => {
    if (!open) return;
    setSubject(initialSubject || "");
    setBody(initialBody || "");
    setMode(detectInitialMode(initialBody || ""));
    setDirty(false);
    setTestStatus(null);
    setToolbarMsg(null);
    setImageMenuOpen(false);
    setYtMenuOpen(false);
    setYtInput("");
    setYtError(null);
    setImageUrlInput("");
    lastVisualBodyRef.current = "";
  }, [open, initialSubject, initialBody]);

  // When entering visual mode (or when body changes from outside the
  // editor — e.g. token insertion, template pick), paint the latest body
  // into the contenteditable div. We avoid re-painting on every onInput
  // by comparing against lastVisualBodyRef.
  useEffect(() => {
    if (mode !== "visual") return;
    const el = visualRef.current;
    if (!el) return;
    if (lastVisualBodyRef.current === body) return;
    el.innerHTML = body;
    lastVisualBodyRef.current = body;
  }, [mode, body, open]);

  // Auto-dismiss toolbar toast
  useEffect(() => {
    if (!toolbarMsg) return;
    const t = setTimeout(() => setToolbarMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toolbarMsg]);

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
    // If we're in visual mode, pick up the very latest innerHTML in
    // case onInput hasn't fired yet (e.g. IME composition end).
    let raw = body;
    if (mode === "visual" && visualRef.current) {
      raw = visualRef.current.innerHTML;
    }
    const clean = DOMPurify.sanitize(raw, SANITIZE_CONFIG as any).toString();
    onSave({ subject: subject.trim(), body: clean });
    onClose();
  }

  // Insert text/HTML into whichever editor is active.
  function insertAtCursor(text: string) {
    if (mode === "html") {
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
      return;
    }
    // Visual mode
    const el = visualRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();
    // execCommand("insertHTML") respects current selection inside the
    // contenteditable, which is what we want for cursor-position insert.
    try {
      document.execCommand("insertHTML", false, text);
    } catch {
      el.innerHTML += text;
    }
    const next = el.innerHTML;
    lastVisualBodyRef.current = next;
    setBody(next);
    setDirty(true);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Only remember the range if it's inside the visual editor.
    const root = visualRef.current;
    if (!root) return;
    if (root.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Toolbar commands (visual mode only). Most lean on execCommand —
  // deprecated but still universally supported and good enough here.
  function exec(cmd: string, value?: string) {
    const el = visualRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();
    try {
      document.execCommand(cmd, false, value);
    } catch {
      // ignore
    }
    const next = el.innerHTML;
    lastVisualBodyRef.current = next;
    setBody(next);
    setDirty(true);
  }

  function applyHeading(tag: "H2" | "P") {
    exec("formatBlock", `<${tag}>`);
  }

  function applyLink() {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("mailto:")) {
      setToolbarMsg({ kind: "err", msg: "Link must start with http://, https://, or mailto:" });
      return;
    }
    const el = visualRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();
    const sel = window.getSelection();
    // If no selection, just insert the URL as a link.
    if (!sel || sel.isCollapsed) {
      insertAtCursor(`<a href="${trimmed}" target="_blank" rel="noopener">${trimmed}</a>`);
      return;
    }
    // Use createLink then patch target/rel via a follow-up DOM walk.
    try {
      document.execCommand("createLink", false, trimmed);
    } catch {
      /* ignore */
    }
    // Ensure target=_blank rel=noopener on the new anchor(s) — find
    // anchors whose href === trimmed and stamp the attrs.
    el.querySelectorAll(`a[href="${cssEscape(trimmed)}"]`).forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
    const next = el.innerHTML;
    lastVisualBodyRef.current = next;
    setBody(next);
    setDirty(true);
  }

  async function handleFilePicked(file: File) {
    setImageMenuOpen(false);
    if (!file.type.startsWith("image/")) {
      setToolbarMsg({ kind: "err", msg: "Only image files are allowed." });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setToolbarMsg({ kind: "err", msg: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` });
      return;
    }
    setImageUploading(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userData?.user?.id || "anon";
      const ts = Date.now();
      const safe = sanitizeFileName(file.name);
      const path = `email-images/${userId}/${ts}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("assets").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("Could not resolve public URL for upload.");
      insertImage(publicUrl);
      setToolbarMsg({ kind: "ok", msg: "Image uploaded." });
    } catch (err: any) {
      // Surface the real error rather than swallow it.
      const msg = err?.message || err?.error_description || "Image upload failed.";
      setToolbarMsg({ kind: "err", msg });
    } finally {
      setImageUploading(false);
      // Reset the file input so re-picking the same file re-fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function insertImage(url: string) {
    const html = buildImageTag(url);
    insertAtCursor(html);
  }

  function handleInsertImageUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && !url.startsWith("data:image/")) {
      setToolbarMsg({ kind: "err", msg: "Image URL must start with http://, https://, or data:image/" });
      return;
    }
    insertImage(url);
    setImageUrlInput("");
    setImageMenuOpen(false);
  }

  function handleInsertYouTube() {
    const id = extractYouTubeId(ytInput);
    if (!id) {
      setYtError("Paste a YouTube link.");
      return;
    }
    insertAtCursor(buildYouTubeEmbed(id));
    setYtInput("");
    setYtError(null);
    setYtMenuOpen(false);
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
          {/* Source / Visual editor */}
          <div className={`flex min-h-0 flex-col border-r border-slate-200 ${mode === "visual" ? "bg-white" : "bg-[#0F172A]"}`}>
            {/* Pane header — mode toggle replaces the static label */}
            <div
              className={`flex items-center justify-between border-b px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] ${
                mode === "visual"
                  ? "border-slate-200 bg-slate-50 text-slate-500"
                  : "border-slate-800 bg-[#0B1220] text-slate-400"
              }`}
              style={{ fontFamily: fontDisplay }}
            >
              <div className={`inline-flex rounded-md border p-0.5 text-[10px] ${
                mode === "visual" ? "border-slate-200 bg-white" : "border-slate-700 bg-[#111B30]"
              }`}>
                {[
                  { k: "visual", label: "Visual" },
                  { k: "html", label: "HTML" },
                ].map((m) => {
                  const active = mode === m.k;
                  return (
                    <button
                      key={m.k}
                      type="button"
                      onClick={() => setMode(m.k as any)}
                      className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-semibold ${
                        active
                          ? "bg-slate-900 text-white"
                          : (mode === "visual" ? "text-slate-600 hover:bg-slate-100" : "text-slate-400 hover:bg-[#1B2745]")
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <span className={mode === "visual" ? "text-slate-500" : "text-slate-500"} style={{ fontFamily: fontMono }}>
                {charCount.toLocaleString()} chars
              </span>
            </div>

            {/* Visual mode toolbar */}
            {mode === "visual" ? (
              <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-2 py-1.5">
                <ToolbarBtn title="Bold (Ctrl+B)" onClick={() => exec("bold")}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
                <ToolbarBtn title="Italic (Ctrl+I)" onClick={() => exec("italic")}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
                <ToolbarBtn title="Underline (Ctrl+U)" onClick={() => exec("underline")}><Underline className="h-3.5 w-3.5" /></ToolbarBtn>
                <ToolbarSep />
                <ToolbarBtn title="Heading 2" onClick={() => applyHeading("H2")}><Heading2 className="h-3.5 w-3.5" /></ToolbarBtn>
                <ToolbarBtn title="Paragraph" onClick={() => applyHeading("P")}><Pilcrow className="h-3.5 w-3.5" /></ToolbarBtn>
                <ToolbarSep />
                <ToolbarBtn title="Bulleted list" onClick={() => exec("insertUnorderedList")}><List className="h-3.5 w-3.5" /></ToolbarBtn>
                <ToolbarBtn title="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></ToolbarBtn>
                <ToolbarSep />
                <ToolbarBtn title="Insert link" onClick={() => { saveSelection(); applyLink(); }}><Link2 className="h-3.5 w-3.5" /></ToolbarBtn>

                {/* Image button + popover */}
                <div className="relative">
                  <ToolbarBtn
                    title="Insert image"
                    onClick={() => {
                      saveSelection();
                      setYtMenuOpen(false);
                      setImageMenuOpen((v) => !v);
                    }}
                  >
                    {imageUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  </ToolbarBtn>
                  {imageMenuOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-1 w-[320px] rounded-lg border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500" style={{ fontFamily: fontDisplay }}>
                        Upload from device
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={imageUploading}
                        className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        style={{ fontFamily: fontDisplay }}
                      >
                        {imageUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                        Choose image (max 10 MB)
                      </button>
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500" style={{ fontFamily: fontDisplay }}>
                        Or paste an image URL
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          value={imageUrlInput}
                          onChange={(e) => setImageUrlInput(e.target.value)}
                          placeholder="https://cdn.example.com/hero.png"
                          className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] outline-none placeholder:text-slate-400 focus:border-blue-300"
                          style={{ fontFamily: fontBody }}
                        />
                        <button
                          type="button"
                          onClick={handleInsertImageUrl}
                          disabled={!imageUrlInput.trim()}
                          className="inline-flex items-center rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          style={{ fontFamily: fontDisplay }}
                        >
                          Insert
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFilePicked(f);
                    }}
                  />
                </div>

                {/* YouTube button + popover */}
                <div className="relative">
                  <ToolbarBtn
                    title="Insert YouTube video"
                    onClick={() => {
                      saveSelection();
                      setImageMenuOpen(false);
                      setYtMenuOpen((v) => !v);
                    }}
                  >
                    <Youtube className="h-3.5 w-3.5" />
                  </ToolbarBtn>
                  {ytMenuOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-1 w-[340px] rounded-lg border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500" style={{ fontFamily: fontDisplay }}>
                        YouTube URL
                      </div>
                      <input
                        value={ytInput}
                        onChange={(e) => { setYtInput(e.target.value); setYtError(null); }}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="mb-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] outline-none placeholder:text-slate-400 focus:border-blue-300"
                        style={{ fontFamily: fontBody }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleInsertYouTube(); }}
                      />
                      {ytError ? (
                        <div className="mb-2 text-[10.5px] text-rose-600" style={{ fontFamily: fontBody }}>{ytError}</div>
                      ) : (
                        <div className="mb-2 text-[10.5px] text-slate-500" style={{ fontFamily: fontBody }}>
                          Inserts an email-safe clickable thumbnail (no iframe).
                        </div>
                      )}
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setYtMenuOpen(false); setYtError(null); }}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          style={{ fontFamily: fontDisplay }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleInsertYouTube}
                          disabled={!ytInput.trim()}
                          className="inline-flex items-center rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          style={{ fontFamily: fontDisplay }}
                        >
                          Insert
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <ToolbarSep />
                <ToolbarBtn title="Clear formatting" onClick={() => exec("removeFormat")}>
                  <RemoveFormatting className="h-3.5 w-3.5" />
                </ToolbarBtn>
              </div>
            ) : null}

            {/* The two editors. We keep both mounted but only show the
                active one so the visual ref stays available for paint. */}
            {mode === "html" ? (
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
            ) : (
              <div
                ref={visualRef}
                contentEditable
                suppressContentEditableWarning
                spellCheck
                className="min-h-0 flex-1 overflow-auto bg-white px-5 py-4 text-[14px] leading-relaxed text-slate-900 outline-none"
                style={{ fontFamily: fontBody }}
                onInput={(e) => {
                  const next = (e.currentTarget as HTMLDivElement).innerHTML;
                  lastVisualBodyRef.current = next;
                  setBody(next);
                  setDirty(true);
                }}
                onKeyUp={saveSelection}
                onMouseUp={saveSelection}
                onBlur={saveSelection}
              />
            )}
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
              onClick={() => { saveSelection(); setTokenOpen((v) => !v); }}
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
            onClick={() => { setBody(""); lastVisualBodyRef.current = ""; if (visualRef.current) visualRef.current.innerHTML = ""; setDirty(true); }}
            disabled={body.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            style={{ fontFamily: fontDisplay }}
            title="Clear the editor"
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

        {toolbarMsg ? (
          <div
            className={`shrink-0 border-t px-4 py-1.5 text-[11px] ${
              toolbarMsg.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
            style={{ fontFamily: fontBody }}
          >
            {toolbarMsg.msg}
          </div>
        ) : null}

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
          // Template HTML usually ships as a table scaffold — drop into
          // HTML mode so the user can edit the table directly.
          setMode(detectInitialMode(t.body_html));
          setDirty(true);
          setGalleryOpen(false);
        }}
      />
    </>
  );
}

// Small, ghost-style toolbar button (28x28) for the visual editor.
function ToolbarBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      // onMouseDown preserves the current contenteditable selection;
      // onClick fires the command after focus returns.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  );
}

function ToolbarSep() {
  return <span className="mx-1 inline-block h-4 w-px bg-slate-200" aria-hidden />;
}

// Escape characters that have special meaning in CSS attribute selectors
// — used when we need to find anchors by exact href after createLink.
function cssEscape(s: string): string {
  if (typeof (window as any).CSS?.escape === "function") return (window as any).CSS.escape(s);
  return s.replace(/["\\]/g, "\\$&");
}

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
